import type { CommerceAdapter } from '@/contract/commerce-adapter';
import type { KitStore } from '@/contract/kit-store';
import type { KitEvent, PersonaId, Profile } from '@/contract/types';
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
function logStep(id: string, start: number) {
  console.info(
    `[kit] ${id} ${((performance.now() - start) / 1000).toFixed(3)}s`,
  );
}

/** A run owns a fresh thread and persists its complete version before yielding done. */
export async function* runKit(
  input: KitInput,
  deps: PipelineDeps,
): AsyncGenerator<KitEvent> {
  let optionsSent = false;
  try {
    const { adapter, store, llm } = deps;
    const { threadId } = await store.createThread(
      input.owner,
      input.query,
      input.persona,
    );
    let start = performance.now();
    yield {
      event: 'step',
      data: {
        id: 'understand',
        status: 'running',
        detail: 'Understanding your need',
      },
    };
    const plan = await planNeed(llm, input.query);
    logStep('understand', start);
    yield { event: 'step', data: { id: 'understand', status: 'done' } };
    start = performance.now();
    yield { event: 'step', data: { id: 'plan', status: 'running' } };
    const { sessionId } = await adapter.recordIntent({
      query: input.query,
      plan,
      source: 'live',
    });
    yield { event: 'plan', data: { sessionId, threadId, version: 1, plan } };
    logStep('plan', start);
    yield {
      event: 'step',
      data: {
        id: 'plan',
        status: 'done',
        detail: `Planned ${plan.items.length} items`,
      },
    };
    if (plan.budget === null) {
      yield {
        event: 'clarify',
        data: {
          threadId,
          version: 1,
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
        {
          threadId,
          kind: 'new',
          userText: input.query,
          plan,
          excludedKeys: [],
          status: 'awaiting_budget',
          options: [],
          explanation: '',
          diff: null,
          selection: null,
          followUp: null,
        },
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
    logStep('search', start);
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
    logStep('optimize', start);
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
      for await (const delta of explainKit(llm, plan, options)) {
        explanation += delta;
        yield { event: 'explanation', data: { delta } };
      }
    } catch {
      explanationUnavailable = true;
    }
    logStep('explain', start);
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
      {
        threadId,
        kind: 'new',
        userText: input.query,
        plan,
        excludedKeys: [],
        status: 'ready',
        options,
        explanation,
        diff: null,
        selection: null,
        followUp: null,
      },
      input.owner,
    );
    yield {
      event: 'done',
      data: { sessionId, threadId, version: version.version },
    };
  } catch {
    // Once options exist, stream failure must not mislabel a completed basket as
    // an LLM error or claim that an unsaved version was persisted.
    if (optionsSent) throw new Error('Unable to save your kit');
    yield {
      event: 'error',
      data: {
        code: 'llm_error',
        message: 'Unable to build your kit. Please try again.',
      },
    };
  }
}
