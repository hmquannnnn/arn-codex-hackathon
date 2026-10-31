import { expect, it } from 'vitest';
import { runKit } from '@/server/pipeline';
import { runRefine } from '@/server/refine';
import { InMemoryAdapter } from '@/server/commerce';
import { InMemoryKitStore } from '@/server/kits';
import { FakeLLM } from '@/server/llm';
import { kitPlanSchema } from '@/contract/schemas';
import threads from '@/contract/fixtures/threads.sample.json';
import type { KitEvent } from '@/contract/types';
it('persists cart scope and spoken keeps across refinement without outside-cart candidates', async () => {
  const plan = {
    ...kitPlanSchema.parse(threads[0].versions[0].plan),
    deadline: null,
  };
  const shopping = {
    source: 'cart_only' as const,
    cart: [{ productId: 'prod-kidzone-lite-backpack', quantity: 1 }],
    keepProductIds: [],
  };
  const store = new InMemoryKitStore();
  const adapter = new InMemoryAdapter();
  const events: KitEvent[] = [];
  for await (const e of runKit(
    {
      query: 'Keep KidZone, school kit',
      owner: 'alice',
      persona: 'lan',
      shopping,
    },
    {
      adapter,
      store,
      llm: new FakeLLM([
        { ...plan, keepProductIds: ['prod-kidzone-lite-backpack'] },
      ]),
    },
  ))
    events.push(e);
  const done = events.find((e) => e.event === 'done');
  if (done?.event !== 'done') throw Error(JSON.stringify(events));
  const first = await store.getThread(done.data.threadId, 'alice');
  expect(first!.versions[0].plan.shopping).toEqual({
    ...shopping,
    keepProductIds: ['prod-kidzone-lite-backpack'],
  });
  for await (const _ of runRefine(
    { threadId: done.data.threadId, owner: 'alice', message: 'Budget 800k' },
    {
      adapter,
      store,
      llm: new FakeLLM([
        {
          ...plan,
          budget: 800000,
          intent: 'change_kit',
          keepProductIds: ['prod-kidzone-lite-backpack'],
        },
      ]),
    },
  ))
    void _;
  const saved = await store.getThread(done.data.threadId, 'alice');
  expect(saved!.versions).toHaveLength(2);
  expect(saved!.versions[1].plan.shopping?.source).toBe('cart_only');
  expect(
    saved!.versions[1].options
      .flatMap((o) => o.lines)
      .every((l) => l.product.id === 'prod-kidzone-lite-backpack'),
  ).toBe(true);
  expect(await store.getThread(done.data.threadId, 'bob')).toBeNull();
});
import { createEditHandlers } from '@/server/kit/edits';
it('direct edits and thread reload retain source limits and reject an outside-cart selection', async () => {
  const plan = {
    ...kitPlanSchema.parse(threads[0].versions[0].plan),
    deadline: null,
    shopping: {
      source: 'cart_only' as const,
      cart: [{ productId: 'prod-kidzone-lite-backpack', quantity: 1 }],
      keepProductIds: [],
    },
  };
  const adapter = new InMemoryAdapter();
  const store = new InMemoryKitStore();
  const events: KitEvent[] = [];
  for await (const event of runKit(
    {
      query: 'school',
      owner: 'alice',
      persona: 'lan',
      shopping: plan.shopping,
    },
    { adapter, store, llm: new FakeLLM([{ ...plan, keepProductIds: [] }]) },
  ))
    events.push(event);
  const done = events.find((e) => e.event === 'done');
  if (done?.event !== 'done') throw Error('No saved kit');
  const handlers = createEditHandlers({ adapter, store });
  const req = (body: unknown) =>
    new Request('http://localhost/api/kit/adjust', {
      method: 'POST',
      headers: {
        cookie: 'kitly_uid=alice',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });
  const adjusted = await handlers.adjust(
    req({
      threadId: done.data.threadId,
      change: { type: 'set_budget', budget: 800000 },
    }),
  );
  expect(adjusted.status).toBe(200);
  const { version } = await adjusted.json();
  expect(version.plan.shopping).toEqual(plan.shopping);
  const key = plan.items.find(
    (item) => item.category === 'school-backpack',
  )!.key;
  const invalid = await handlers.price(
    req({
      threadId: done.data.threadId,
      selection: {
        profile: 'balanced',
        picks: { [key]: 'prod-minhan-backpack' },
        dropped: [],
      },
    }),
  );
  expect(invalid.status).toBe(400);
  const reloaded = await handlers.thread(
    new Request('http://localhost/api/threads/id', {
      headers: { cookie: 'kitly_uid=alice' },
    }),
    done.data.threadId,
  );
  expect((await reloaded.json()).versions.at(-1).plan.shopping).toEqual(
    plan.shopping,
  );
});
it('does not report missing cart products as marketplace assortment gaps', async () => {
  const adapter = new InMemoryAdapter();
  const store = new InMemoryKitStore();
  const plan = kitPlanSchema.parse(threads[0].versions[0].plan);
  const events: KitEvent[] = [];
  for await (const event of runKit(
    {
      query: 'school from empty cart',
      owner: 'alice',
      persona: 'lan',
      shopping: { source: 'cart_only', cart: [], keepProductIds: [] },
    },
    { adapter, store, llm: new FakeLLM([{ ...plan, keepProductIds: [] }]) },
  ))
    events.push(event);
  const done = events.find((event) => event.event === 'done');
  if (done?.event !== 'done') throw Error('No done');
  expect(
    (await adapter.demandItemsSince('2026-09-02')).filter(
      (row) => row.sessionId === done.data.sessionId,
    ),
  ).toEqual([]);
});
it('treats checkbox keeps as authoritative on initial creation', async () => {
  const plan = kitPlanSchema.parse(threads[0].versions[0].plan);
  const store = new InMemoryKitStore();
  const events: KitEvent[] = [];
  const shopping = {
    source: 'cart_only' as const,
    cart: [{ productId: 'prod-kidzone-lite-backpack', quantity: 1 }],
    keepProductIds: ['prod-kidzone-lite-backpack'],
  };
  for await (const event of runKit(
    { query: 'school', owner: 'alice', persona: 'lan', shopping },
    {
      adapter: new InMemoryAdapter(),
      store,
      llm: new FakeLLM([{ ...plan, keepProductIds: [] }]),
    },
  ))
    events.push(event);
  const done = events.find((event) => event.event === 'done');
  if (done?.event !== 'done') throw Error('No kit');
  expect(
    (await store.getThread(done.data.threadId, 'alice'))!.versions[0].plan
      .shopping!.keepProductIds,
  ).toEqual(shopping.keepProductIds);
});
