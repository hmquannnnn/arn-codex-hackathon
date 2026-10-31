import { afterEach, expect, it, vi } from 'vitest';
import { InMemoryAdapter } from '@/server/commerce';
import { InMemoryKitStore } from '@/server/kits';
import { FakeLLM } from '@/server/llm';
import { createKitHandler, createRefineHandler } from '@/server/sse';
import { createEditHandlers } from '@/server/kit/edits';
import {
  kitEventSchema,
  kitPlanSchema,
  kitVersionSchema,
} from '@/contract/schemas';
import type { BasketOption, KitEvent } from '@/contract/types';
import fixture from '@/contract/fixtures/kit.sample.json';
import { buildCatalog } from '../../scripts/seed/catalog';
const profiles = ['saver', 'balanced', 'premium'] as const;
const plan = () => ({
  ...kitPlanSchema.parse(fixture.find((e) => e.event === 'plan')!.data.plan),
  budget: 3000000,
});
const request = (body: unknown) =>
  new Request('http://localhost/api/kit', {
    method: 'POST',
    headers: {
      cookie: 'kitly_uid=alice; kitly_persona=guest',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });
async function events(response: Response) {
  expect(response.status).toBe(200);
  return (await response.text())
    .trim()
    .split('\n\n')
    .map((frame) => {
      const [e, d] = frame.split('\n');
      return kitEventSchema.parse({
        event: e.slice(7),
        data: JSON.parse(d.slice(6)),
      });
    });
}
function options(stream: KitEvent[]) {
  const e = stream.find((e) => e.event === 'options');
  if (e?.event !== 'options') throw Error('Missing options');
  return e.data.options;
}
function assertProfiles(list: BasketOption[], budget: number) {
  expect(list.map((o) => o.profile)).toEqual(profiles);
  expect(list.every((o) => o.status === 'ok' && o.grandTotal <= budget)).toBe(
    true,
  );
  expect(list[0].grandTotal).toBeLessThanOrEqual(list[1].grandTotal);
  expect(list[1].grandTotal).toBeLessThanOrEqual(list[2].grandTotal);
  expect(list.map((o) => o.lines.map((l) => l.itemKey).sort())).toEqual(
    Array(3).fill(list[0].lines.map((l) => l.itemKey).sort()),
  );
}
afterEach(() => vi.unstubAllEnvs());
it('T20a pipeline uses a deep hero fixture and returns genuine bounded profile tradeoffs through create/refine/adjust', async () => {
  vi.stubEnv('DEMO_TODAY', '2026-09-02');
  const world = buildCatalog([], '2026-09-02');
  const adapter = new InMemoryAdapter({ ...world, demand: [] }),
    store = new InMemoryKitStore();
  for (const item of plan().items.filter((i) => i.category))
    expect(
      (await adapter.searchProducts({ category: item.category! })).length,
    ).toBeGreaterThanOrEqual(5);
  const first = await events(
    await createKitHandler({
      adapter,
      store,
      llm: new FakeLLM([plan()], ['Balanced fits.']),
    })(request({ query: 'Grade1 3M', profiles })),
  );
  const baskets = options(first);
  assertProfiles(baskets, 3000000);
  expect(
    baskets[2].lines.filter(
      (l) =>
        baskets[0].lines.find((s) => s.itemKey === l.itemKey)?.product.id !==
        l.product.id,
    ).length,
  ).toBeGreaterThanOrEqual(2);
  const done = first.at(-1);
  if (done?.event !== 'done') throw Error('No done');
  const threadId = done.data.threadId;
  const refined = await events(
    await createRefineHandler({
      adapter,
      store,
      llm: new FakeLLM([{ ...plan(), budget: 1500000, intent: 'change_kit' }]),
    })(request({ threadId, message: 'Budget1.5M', profiles })),
  );
  assertProfiles(options(refined), 1500000);
  const adjusted = await createEditHandlers({ adapter, store }).adjust(
    request({
      threadId,
      change: { type: 'set_budget', budget: 3000000 },
      profiles,
    }),
  );
  expect(adjusted.status).toBe(200);
  assertProfiles(
    kitVersionSchema.parse((await adjusted.json()).version).options,
    3000000,
  );
});
it('T20a default three options stay separate even when every profile has an identical basket', async () => {
  const uncovered = {
    ...plan(),
    items: plan().items.map((i) => ({ ...i, category: null })),
  };
  const stream = await events(
    await createKitHandler({
      adapter: new InMemoryAdapter(),
      store: new InMemoryKitStore(),
      llm: new FakeLLM([uncovered]),
    })(request({ query: 'Off-catalog kit3M' })),
  );
  const list = options(stream);
  assertProfiles(list, 3000000);
  expect(list.map((o) => o.lines)).toEqual([[], [], []]);
  expect(list.map((o) => o.grandTotal)).toEqual([0, 0, 0]);
});
it('T20a adjust honours a requested subset and defaults back to all three on the next edit', async () => {
  const adapter = new InMemoryAdapter(),
    store = new InMemoryKitStore();
  const created = await events(
    await createKitHandler({ adapter, store, llm: new FakeLLM([plan()]) })(
      request({ query: 'School kit3M' }),
    ),
  );
  const done = created.at(-1);
  if (done?.event !== 'done') throw Error('No done');
  const adjust = createEditHandlers({ adapter, store }).adjust;
  const one = await adjust(
    request({
      threadId: done.data.threadId,
      change: { type: 'set_budget', budget: 3000000 },
      profiles: ['premium'],
    }),
  );
  expect(
    (await one.json()).version.options.map((o: BasketOption) => o.profile),
  ).toEqual(['premium']);
  const all = await adjust(
    request({
      threadId: done.data.threadId,
      change: { type: 'set_budget', budget: 3000000 },
    }),
  );
  expect(
    (await all.json()).version.options.map((o: BasketOption) => o.profile),
  ).toEqual(profiles);
});
it('T20a identical nonempty selections are returned once per profile', async () => {
  const p = plan();
  p.items = p.items.map((i) => ({
    ...i,
    mustHaveTags: [],
    maxUnitPrice: null,
  }));
  const world = buildCatalog([], '2026-09-02');
  const products = [...new Set(p.items.map((i) => i.category))].flatMap(
    (category) =>
      world.products
        .filter(
          (product) =>
            product.category === category &&
            product.stock >= 3 &&
            product.shipDaysMax <= 2,
        )
        .slice(0, 1),
  );
  const adapter = new InMemoryAdapter({ ...world, products, demand: [] });
  const list = options(
    await events(
      await createKitHandler({
        adapter,
        store: new InMemoryKitStore(),
        llm: new FakeLLM([p]),
      })(request({ query: 'School kit3M' })),
    ),
  );
  expect(list).toHaveLength(3);
  expect(list[0].lines.length).toBeGreaterThanOrEqual(5);
  expect(list.map((o) => o.lines.map((l) => l.product.id))).toEqual(
    Array(3).fill(list[0].lines.map((l) => l.product.id)),
  );
});
