import type { CommerceAdapter } from '@/contract/commerce-adapter';
import type { KitStore } from '@/contract/kit-store';
import type {
  KitEvent,
  KitPlan,
  PersonaId,
  PlanDiff,
  Profile,
} from '@/contract/types';
import type { LLM } from '@/server/llm/types';
import { planNeed } from '@/server/planner';
import { matchPlan } from '@/server/matcher';
import { optimizeProfiles } from '@/server/optimizer';
import { explainKit } from '@/server/explainer';

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
    const [matched, , vouchers] = await Promise.all([
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
    const version = await store.appendVersion(
      { ...base, status: 'ready', options, explanation },
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
