import { afterEach, expect, it, vi } from 'vitest';
import { runKit } from '@/server/pipeline';
import { runRefine } from '@/server/refine';
import { InMemoryAdapter } from '@/server/commerce';
import { InMemoryKitStore } from '@/server/kits';
import { FakeLLM } from '@/server/llm';
import {
  kitEventSchema,
  kitPlanSchema,
  kitVersionSchema,
} from '@/contract/schemas';
import type { CommerceAdapter } from '@/contract/commerce-adapter';
import type { KitEvent } from '@/contract/types';
import threads from '@/contract/fixtures/threads.sample.json';
const initial = kitPlanSchema.parse(threads[0].versions[0].plan);
initial.items = initial.items.map((item) =>
  item.key === 'uniform-shirt' ? { ...item, key: 'uniform' } : item,
);
class CountingAdapter extends InMemoryAdapter {
  intents = 0;
  override async recordIntent(
    input: Parameters<CommerceAdapter['recordIntent']>[0],
  ) {
    this.intents++;
    return super.recordIntent(input);
  }
}
afterEach(() => vi.unstubAllEnvs());
it('refines one owned thread, keeps version1 immutable and records an intent without changing demand or gap counts', async () => {
  vi.stubEnv('DEMO_TODAY', '2026-09-02');
  const adapter = new CountingAdapter();
  const store = new InMemoryKitStore();
  for await (const _event of runKit(
    { query: 'School kit 1.5M', owner: 'alice', persona: 'lan' },
    { adapter, store, llm: new FakeLLM([initial], ['First.']) },
  )) {
    void _event;
  }
  const threadId = (await store.listThreads('alice'))[0].id;
  const before = (await store.getThread(threadId, 'alice'))!;
  const demandBefore = await adapter.demandItemsSince('2026-08-01');
  const next = {
    ...initial,
    budget: 1000000,
    items: initial.items.filter((item) => item.key !== 'uniform'),
  };
  const llm = new FakeLLM(
    [{ ...next, intent: 'change_kit' }],
    ['Removed uniform. New total fits 1M.'],
  );
  const events: KitEvent[] = [];
  for await (const event of runRefine(
    { threadId, owner: 'alice', message: 'School gives uniform, budget1M' },
    { adapter, store, llm },
  )) {
    events.push(kitEventSchema.parse(event));
    if (event.event === 'done')
      expect((await store.getThread(threadId, 'alice'))?.versions).toHaveLength(
        2,
      );
  }
  expect(events.find((event) => event.event === 'plan')).toMatchObject({
    data: {
      version: 2,
      diff: { removed: ['uniform'], added: [], changed: [] },
    },
  });
  const after = (await store.getThread(threadId, 'alice'))!;
  expect(after.versions[0]).toEqual(before.versions[0]);
  expect(after.versions[1]).toMatchObject({
    kind: 'refine',
    version: 2,
    plan: { budget: 1000000 },
    diff: { removed: ['uniform'] },
  });
  expect(
    after.versions[1].options.every((option) => option.grandTotal <= 1000000),
  ).toBe(true);
  expect(await adapter.demandItemsSince('2026-08-01')).toEqual(demandBefore);
  expect(adapter.intents).toBe(2);
  const explanationFacts = JSON.parse(
    llm.calls
      .find((call) => call.kind === 'stream')!
      .messages.find((message) => message.role === 'user')!.content,
  );
  expect(explanationFacts.changeContext.before.budget).toBe(initial.budget);
  expect(explanationFacts.changeContext.after.budget).toBe(1000000);
  expect(explanationFacts.changeContext.removed[0]).toMatchObject({
    key: 'uniform',
  });
  expect(await store.getThread(threadId, 'bob')).toBeNull();
});
it('never re-adds an excluded historical category even under a renamed key on change turns', async () => {
  const adapter = new CountingAdapter();
  const store = new InMemoryKitStore();
  for await (const event of runKit(
    { query: 'School kit 1.5M', owner: 'alice', persona: 'guest' },
    { adapter, store, llm: new FakeLLM([initial]) },
  )) {
    void event;
  }
  const threadId = (await store.listThreads('alice'))[0].id;
  const before = (await store.getThread(threadId, 'alice'))!.versions[0];
  const { version: _version, createdAt: _created, ...base } = before;
  await store.appendVersion(
    {
      ...base,
      kind: 'adjust',
      plan: {
        ...before.plan,
        items: before.plan.items.filter((item) => item.key !== 'water-bottle'),
      },
      excludedKeys: ['water-bottle'],
    },
    'alice',
  );
  const renamed = {
    ...initial,
    items: initial.items.map((item) =>
      item.key === 'water-bottle' ? { ...item, key: 'new-drink' } : item,
    ),
  };
  const llm = new FakeLLM([{ ...renamed, intent: 'change_kit' }]);
  const events: KitEvent[] = [];
  for await (const event of runRefine(
    { threadId, owner: 'alice', message: 'Make it waterproof' },
    { adapter, store, llm },
  ))
    events.push(kitEventSchema.parse(event));
  const latest = (await store.getThread(threadId, 'alice'))!.versions[2];
  expect(
    latest.plan.items.some((item) => item.category === 'water-bottle'),
  ).toBe(false);
  expect(latest.excludedKeys).toEqual(['water-bottle']);
  expect(events.at(-1)).toMatchObject({ event: 'done', data: { version: 3 } });
  expect(events.at(-1)?.data).not.toHaveProperty('answered');
  expect(
    llm.calls[0].messages.map((message) => message.content).join('\n'),
  ).toContain('water-bottle');
});
it('enforces unresolved excluded keys and category-id keys without erasing unrelated uncovered needs', async () => {
  const store = new InMemoryKitStore();
  const adapter = new InMemoryAdapter();
  const { threadId } = await store.createThread(
    'alice',
    'Historical partial kit',
    'lan',
  );
  const {
    version: _version,
    createdAt: _created,
    ...base
  } = kitVersionSchema.parse(threads[0].versions[0]);
  const previous = {
    ...initial,
    items: initial.items.filter((item) => item.category !== 'water-bottle'),
  };
  await store.appendVersion(
    {
      ...base,
      threadId,
      plan: previous,
      excludedKeys: ['water-bottle', 'already-owned'],
    },
    'alice',
  );
  const bottle = initial.items.find(
    (item) => item.category === 'water-bottle',
  )!;
  const returned = {
    ...previous,
    items: [
      ...previous.items,
      { ...bottle, key: 'renamed-bottle' },
      { ...bottle, key: 'already-owned', category: null },
      { ...bottle, key: 'dog-food', category: null },
    ],
  };
  for await (const event of runRefine(
    { threadId, owner: 'alice', message: 'Keep going' },
    {
      adapter,
      store,
      llm: new FakeLLM([{ ...returned, intent: 'change_kit' }]),
    },
  )) {
    kitEventSchema.parse(event);
  }
  const latest = (await store.getThread(threadId, 'alice'))!.versions[1];
  expect(
    latest.plan.items.some(
      (item) =>
        item.category === 'water-bottle' || item.key === 'already-owned',
    ),
  ).toBe(false);
  expect(latest.plan.items.some((item) => item.key === 'dog-food')).toBe(true);
});
it('uses only the most recent historical category for each excluded stable key', async () => {
  const store = new InMemoryKitStore();
  const adapter = new InMemoryAdapter();
  const { threadId } = await store.createThread('alice', 'Stationery', 'guest');
  const {
    version: _v,
    createdAt: _t,
    ...base
  } = kitVersionSchema.parse(threads[0].versions[0]);
  const oldItem = {
    ...initial.items[0],
    key: 'stationery',
    category: 'pencils-pens',
  };
  const newItem = { ...oldItem, category: 'notebooks' };
  await store.appendVersion(
    { ...base, threadId, plan: { ...initial, items: [oldItem] } },
    'alice',
  );
  await store.appendVersion(
    { ...base, threadId, plan: { ...initial, items: [newItem] } },
    'alice',
  );
  await store.appendVersion(
    {
      ...base,
      threadId,
      plan: { ...initial, items: [] },
      excludedKeys: ['stationery'],
    },
    'alice',
  );
  const returned = {
    ...initial,
    items: [
      { ...oldItem, key: 'new-pencils' },
      { ...newItem, key: 'new-notebooks' },
    ],
  };
  for await (const event of runRefine(
    { threadId, owner: 'alice', message: 'Add new pencils' },
    {
      store,
      adapter,
      llm: new FakeLLM([{ ...returned, intent: 'change_kit' }]),
    },
  )) {
    kitEventSchema.parse(event);
  }
  expect(
    (await store.getThread(threadId, 'alice'))?.versions
      .at(-1)
      ?.plan.items.map((item) => item.key),
  ).toEqual(['new-pencils']);
});

it.each(['composer', 'quick choice'])(
  'B7 first budget via %s records demand once across later edits',
  async (entry) => {
    const { createEditHandlers } = await import('@/server/kit/edits');
    const adapter = new InMemoryAdapter({ demand: [] });
    const store = new InMemoryKitStore();
    for await (const e of runKit(
      { query: 'School kit', owner: 'alice', persona: 'guest' },
      { adapter, store, llm: new FakeLLM([{ ...initial, budget: null }]) },
    ))
      void e;
    const threadId = (await store.listThreads('alice'))[0].id;
    const handlers = createEditHandlers({ adapter, store });
    const adjust = () =>
      handlers.adjust(
        new Request('http://localhost/api/kit/adjust', {
          method: 'POST',
          headers: { cookie: 'kitly_uid=alice' },
          body: JSON.stringify({
            threadId,
            change: { type: 'set_budget', budget: 1500000 },
          }),
        }),
      );
    if (entry === 'composer') {
      for await (const e of runRefine(
        { threadId, owner: 'alice', message: 'My budget is 1.5M' },
        {
          adapter,
          store,
          llm: new FakeLLM([{ ...initial, intent: 'change_kit' }]),
        },
      ))
        void e;
    } else expect((await adjust()).status).toBe(200);
    expect(
      (await store.getThread(threadId, 'alice'))?.versions.map((v) => v.status),
    ).toEqual(['awaiting_budget', 'ready']);
    expect(await adapter.demandItemsSince('2000-01-01')).toHaveLength(
      initial.items.length,
    );
    for await (const e of runRefine(
      { threadId, owner: 'alice', message: 'Budget 1M' },
      {
        adapter,
        store,
        llm: new FakeLLM([
          { ...initial, budget: 1000000, intent: 'change_kit' },
        ]),
      },
    ))
      void e;
    expect((await adjust()).status).toBe(200);
    expect(await adapter.demandItemsSince('2000-01-01')).toHaveLength(
      initial.items.length,
    );
  },
);
