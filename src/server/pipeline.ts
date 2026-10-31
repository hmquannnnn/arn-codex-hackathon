import type { CommerceAdapter } from '@/contract/commerce-adapter';
import type { KitStore } from '@/contract/kit-store';
import type {
  KitEvent,
  KitPlan,
  KitSelection,
  PersonaId,
  PlanDiff,
  Profile,
} from '@/contract/types';
import type { LLM } from '@/server/llm/types';
import { planNeed } from '@/server/planner';
import { matchPlan } from '@/server/matcher';
import { optimizeProfiles } from '@/server/optimizer';
import { explainKit } from '@/server/explainer';
import { findInterests } from '@/server/kit/interests';
import { buildSalesContext } from '@/server/kit/sales-context';
import { followUp } from '@/server/kit/follow-up';
import { alternativeFacts } from '@/server/kit/alternatives';
import { today } from '@/server/today';
import { retainSelection } from '@/server/kit/selection';
import { priceSelection } from '@/server/optimizer/selection';

export interface PipelineDeps {
  adapter: CommerceAdapter;
  store: KitStore;
  llm: LLM;
}
export interface KitInput {
  query: string;
  owner: string;
  persona: PersonaId;
  profiles?: Profile[];
}
interface CompletionInput extends KitInput {
  threadId: string;
  plan: KitPlan;
  version: number;
  kind: 'new' | 'refine';
  excludedKeys: string[];
  diff: PlanDiff | null;
  recordDemand: boolean;
  previousPlan?: KitPlan;
  previousSelection?: KitSelection | null;
}
export function logKitStep(id: string, start: number) {
  console.info(
    `[kit] ${id} ${((performance.now() - start) / 1000).toFixed(3)}s`,
  );
}
export function kitFailure(): KitEvent {
  return {
    event: 'error',
    data: {
      code: 'llm_error',
      message: 'Unable to build your kit. Please try again.',
    },
  };
}

/** Shared downstream pipeline; only the first ready run writes demand rows. */
export async function* completeKit(
  input: CompletionInput,
  deps: PipelineDeps,
): AsyncGenerator<KitEvent> {
  let optionsSent = false;
  try {
    const { adapter, store, llm } = deps;
    const { plan, threadId } = input;
    let start = performance.now();
    yield { event: 'step', data: { id: 'plan', status: 'running' } };
    const { sessionId } = await adapter.recordIntent({
      query: input.query,
      plan,
      source: 'live',
    });
    yield {
      event: 'plan',
      data: {
        sessionId,
        threadId,
        version: input.version,
        plan,
        ...(input.diff ? { diff: input.diff } : {}),
      },
    };
    logKitStep('plan', start);
    yield {
      event: 'step',
      data: {
        id: 'plan',
        status: 'done',
        detail: `Planned ${plan.items.length} items`,
      },
    };
    const base = {
      threadId,
      kind: input.kind,
      userText: input.query,
      plan,
      excludedKeys: input.excludedKeys,
      diff: input.diff,
      selection: null,
      followUp: null,
    };
    if (plan.budget === null) {
      yield {
        event: 'clarify',
        data: {
          threadId,
          version: input.version,
          question: {
            kind: 'budget',
            text:
              plan.language === 'vi'
                ? 'Bạn dự định ngân sách bao nhiêu?'
                : 'What is your budget?',
            choices: [500000, 1000000, 2000000, null],
          },
        },
      };
      const version = await store.appendVersion(
        { ...base, status: 'awaiting_budget', options: [], explanation: '' },
        input.owner,
      );
      yield {
        event: 'done',
        data: { sessionId, threadId, version: version.version },
      };
      return;
    }
    start = performance.now();
    yield { event: 'step', data: { id: 'search', status: 'running' } };
    const [matched, persona, vouchers] = await Promise.all([
      matchPlan(plan, adapter),
      adapter.getPersona(input.persona),
      adapter.listVouchers(input.persona),
    ]);
    logKitStep('search', start);
    yield {
      event: 'step',
      data: {
        id: 'search',
        status: 'done',
        detail: `Compared ${matched.comparedProducts} products from ${matched.comparedShops} shops`,
      },
    };
    start = performance.now();
    yield { event: 'step', data: { id: 'optimize', status: 'running' } };
    const options = optimizeProfiles(
      {
        plan,
        candidates: matched.candidates,
        noMatch: matched.noMatch,
        vouchers,
      },
      input.profiles,
    );
    const available = findInterests(
      plan,
      { lines: [] },
      matched.related,
      persona,
      vouchers,
      today(),
    );
    const selection = retainSelection(
      input.previousSelection ?? null,
      plan,
      matched,
      available,
    );
    if (selection) {
      const priced = priceSelection(
        plan,
        matched,
        selection,
        vouchers,
        available,
      );
      const index = options.findIndex((o) => o.profile === selection.profile);
      if (index < 0) options.push(priced);
      else options[index] = priced;
    }
    for (const option of options)
      option.interests = findInterests(
        plan,
        option,
        matched.related,
        persona,
        vouchers,
        today(),
      );
    if (input.recordDemand)
      await adapter.recordDemandItems(
        sessionId,
        plan.items.map((item) => ({
          item,
          matchedCount: matched.matchedCounts[item.key] ?? 0,
          budgetHint:
            item.maxUnitPrice ??
            Math.floor(plan.budget! / Math.max(1, plan.items.length)),
        })),
      );
    logKitStep('optimize', start);
    yield {
      event: 'step',
      data: {
        id: 'optimize',
        status: 'done',
        detail: `Optimized ${options.length} basket options`,
      },
    };
    optionsSent = true;
    yield { event: 'options', data: { options } };
    const selected =
      options.find((o) => o.profile === (selection?.profile ?? 'balanced')) ??
      options[0];
    const context = buildSalesContext(
      plan,
      selected,
      persona,
      vouchers,
      today(),
      matched.shops,
    );
    const following = followUp(llm, {
      plan,
      option: selected,
      context,
      alternatives: alternativeFacts(plan, selected, matched, vouchers),
      message: input.query,
    });
    start = performance.now();
    yield { event: 'step', data: { id: 'explain', status: 'running' } };
    let explanation = '';
    let explanationUnavailable = false;
    try {
      for await (const delta of explainKit(
        llm,
        plan,
        options,
        input.diff ?? undefined,
        input.previousPlan,
        context,
      )) {
        explanation += delta;
        yield { event: 'explanation', data: { delta } };
      }
    } catch {
      explanationUnavailable = true;
    }
    logKitStep('explain', start);
    yield {
      event: 'step',
      data: {
        id: 'explain',
        status: 'done',
        ...(explanationUnavailable
          ? { detail: 'Explanation unavailable' }
          : {}),
      },
    };
    const nextFollowUp = await following;
    yield { event: 'followup', data: { followUp: nextFollowUp } };
    const version = await store.appendVersion(
      {
        ...base,
        selection,
        followUp: nextFollowUp,
        status: 'ready',
        options,
        explanation,
      },
      input.owner,
    );
    yield {
      event: 'done',
      data: { sessionId, threadId, version: version.version },
    };
  } catch {
    if (optionsSent) throw new Error('Unable to save your kit');
    yield kitFailure();
  }
}

/** A new need owns a fresh thread; failures before any options become terminal SSE errors. */
export async function* runKit(
  input: KitInput,
  deps: PipelineDeps,
): AsyncGenerator<KitEvent> {
  let threadId: string;
  let plan: KitPlan;
  try {
    ({ threadId } = await deps.store.createThread(
      input.owner,
      input.query,
      input.persona,
    ));
    const start = performance.now();
    yield {
      event: 'step',
      data: {
        id: 'understand',
        status: 'running',
        detail: 'Understanding your need',
      },
    };
    plan = await planNeed(deps.llm, input.query);
    logKitStep('understand', start);
    yield { event: 'step', data: { id: 'understand', status: 'done' } };
  } catch {
    yield kitFailure();
    return;
  }
  yield* completeKit(
    {
      ...input,
      threadId,
      plan,
      version: 1,
      kind: 'new',
      excludedKeys: [],
      diff: null,
      recordDemand: true,
    },
    deps,
  );
}
