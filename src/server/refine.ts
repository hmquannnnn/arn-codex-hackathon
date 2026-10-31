import { z } from 'zod';
import type {
  KitEvent,
  PlanItem,
  Profile,
  ThreadResponse,
} from '@/contract/types';
import type { KitStore } from '@/contract/kit-store';
import { HttpError } from '@/server/http';
import {
  completeKit,
  kitFailure,
  logKitStep,
  type PipelineDeps,
} from '@/server/pipeline';
import { refineNeed } from '@/server/planner';
import { diffPlans } from '@/server/diff';
import { answerKit } from '@/server/kit/answer';
import { categories } from '@/contract/taxonomy';
export interface RefineInput {
  threadId: string;
  owner: string;
  message: string;
  profiles?: Profile[];
}

/** Load and authorize before opening SSE; malformed UUIDs must never reach Postgres. */
export async function loadRefineThread(
  threadId: string,
  owner: string,
  store: KitStore,
) {
  if (!z.uuid().safeParse(threadId).success)
    throw new HttpError(404, 'not_found', 'Kit not found');
  const thread = await store.getThread(threadId, owner);
  if (!thread?.versions.length)
    throw new HttpError(404, 'not_found', 'Kit not found');
  return thread;
}
export async function* runRefine(
  input: RefineInput,
  deps: PipelineDeps,
  loaded?: ThreadResponse,
): AsyncGenerator<KitEvent> {
  const thread =
    loaded ?? (await loadRefineThread(input.threadId, input.owner, deps.store));
  const latest = thread.versions.at(-1)!;
  // A removed item's category may exist only in an earlier historical version.
  const excluded: PlanItem[] = latest.excludedKeys.flatMap((key) => {
    const historical = [...thread.versions]
      .reverse()
      .map((version) => version.plan.items.find((item) => item.key === key))
      .find((item) => item !== undefined);
    if (historical) return [historical];
    // A legacy key can itself be a taxonomy category; unknown keys still remain
    // blocked by key, while null never becomes a wildcard across uncovered needs.
    return [
      {
        key,
        needLabel: key,
        category: categories.some((category) => category.id === key)
          ? key
          : null,
        required: false,
        quantity: 1,
        mustHaveTags: [],
        niceToHaveTags: [],
        maxUnitPrice: null,
      },
    ];
  });
  let plan;
  let intent;
  try {
    const start = performance.now();
    const cartProducts = latest.plan.shopping
      ? await Promise.all(
          latest.plan.shopping.cart.map((line) =>
            deps.adapter.getProduct(line.productId),
          ),
        )
      : [];
    const titles = Object.fromEntries(
      cartProducts.flatMap((product) =>
        product ? [[product.id, product.title]] : [],
      ),
    );
    ({ plan, intent } = await refineNeed(
      deps.llm,
      latest.plan,
      input.message,
      excluded,
      titles,
    ));
    logKitStep('understand', start);
    if (intent === 'answer' && latest.status === 'ready') {
      yield {
        event: 'step',
        data: { id: 'understand', status: 'running', detail: 'Answering' },
      };
      yield* answerKit(
        {
          latest,
          persona: thread.thread.persona,
          owner: input.owner,
          message: input.message,
        },
        deps,
      );
      return;
    }
    yield {
      event: 'step',
      data: {
        id: 'understand',
        status: 'running',
        detail: 'Understanding your changes',
      },
    };
    yield { event: 'step', data: { id: 'understand', status: 'done' } };
  } catch {
    yield kitFailure();
    return;
  }
  yield* completeKit(
    {
      query: input.message,
      owner: input.owner,
      threadId: input.threadId,
      persona: thread.thread.persona,
      profiles: input.profiles,
      plan,
      version: latest.version + 1,
      kind: 'refine',
      excludedKeys: latest.excludedKeys,
      diff: diffPlans(latest.plan, plan),
      previousPlan: latest.plan,
      previousSelection: latest.selection,
      recordDemand: !thread.versions.some((v) => v.status === 'ready'),
    },
    deps,
  );
}
