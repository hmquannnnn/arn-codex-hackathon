import { expect, it } from 'vitest';
import { InMemoryAdapter } from '@/server/commerce';
import { FakeLLM } from '@/server/llm';
import { insightsResponseSchema, kitPlanSchema } from '@/contract/schemas';
import fixture from '@/contract/fixtures/kit.sample.json';
import { getInsights } from '@/server/insights';
const plan = kitPlanSchema.parse(
  fixture.find((e) => e.event === 'plan')!.data.plan,
);
class SellerLLM extends FakeLLM {
  override async structured<T>(
    ...args: Parameters<FakeLLM['structured']>
  ): Promise<T> {
    const prompt = args[2].map((m) => m.content).join('\n');
    const supports = prompt.includes('spine straight');
    const result = prompt.includes('supports')
      ? { supports, evidence: supports ? 'keep the spine straight' : '' }
      : {
          advice: prompt.includes(
            'never advise creating a new or duplicate listing',
          )
            ? 'Update the existing backpack listing.'
            : 'Consider stocking this need.',
        };
    return new FakeLLM([result]).structured(...args).then((value) => {
      this.calls.push({
        kind: 'structured',
        model: args[0],
        messages: args[2],
      });
      return value as T;
    });
  }
}
it('S3 returns distinct-session weekly gaps, bands, shop-specific supported listing first and additive advice', async () => {
  const adapter = new InMemoryAdapter(),
    llm = new SellerLLM();
  const result = insightsResponseSchema.parse(
    await getInsights({ adapter, cache: adapter, llm }, 'shop-minhan'),
  );
  const backpack = result.gaps.find(
    (g) => g.key === 'school-backpack|anti-hunchback',
  )!;
  expect(backpack.type).toBe('listing_gap');
  expect(result.gaps[0].key).toBe(backpack.key);
  expect(backpack.candidates?.[0]).toMatchObject({
    productId: 'prod-minhan-backpack',
    evidence: 'keep the spine straight',
  });
  expect(backpack.thisWeek).toBeGreaterThanOrEqual(3);
  expect(backpack.lastWeek).toBeGreaterThan(0);
  expect(backpack.priceBand).not.toBeNull();
  const adviceCalls = llm.calls.filter((c) =>
    c.messages.some((m) => m.content.includes('ONE advice sentence')),
  );
  expect(
    adviceCalls.some((c) =>
      c.messages.some(
        (m) =>
          m.content.includes('Minh An Kids Backpack New Model 2026') &&
          m.content.includes(
            'never advise creating a new or duplicate listing',
          ),
      ),
    ),
  ).toBe(true);
  expect(result.gaps.find((g) => g.category === null)?.type).toBe(
    'assortment_gap',
  );
  const before = llm.calls.length;
  expect(
    await getInsights({ adapter, cache: adapter, llm }, 'shop-minhan'),
  ).toEqual(result);
  expect(llm.calls).toHaveLength(before);
});
async function addDemand(
  adapter: InMemoryAdapter,
  items: {
    key: string;
    needLabel: string;
    category: string | null;
    tags: string[];
    hint?: number | null;
    matched?: number;
  }[],
  source: 'live' | 'seed' = 'live',
) {
  const custom = {
    ...plan,
    items: items.map((i) => ({
      key: i.key,
      needLabel: i.needLabel,
      category: i.category,
      required: true,
      quantity: 1,
      mustHaveTags: i.tags,
      niceToHaveTags: [],
      maxUnitPrice: null,
    })),
  };
  const { sessionId } = await adapter.recordIntent({
    query: 'S3 test need',
    plan: custom,
    source,
  });
  await adapter.recordDemandItems(
    sessionId,
    custom.items.map((item, index) => ({
      item,
      matchedCount: items[index].matched ?? 0,
      budgetHint: items[index].hint ?? null,
    })),
  );
}
it('S3 deduplicates same-session gaps, threshold2/3, percentile bands and co-occurring categories; counts changes invalidate advice', async () => {
  const adapter = new InMemoryAdapter(),
    llm = new SellerLLM(),
    deps = { adapter, cache: adapter, llm };
  const item = {
    key: 'light',
    needLabel: 'UV headlamp',
    category: 'headlamp',
    tags: ['uv-protection'],
    hint: 100000,
  };
  const bottle = {
    key: 'bottle',
    needLabel: 'Bottle',
    category: 'water-bottle',
    tags: [],
    matched: 4,
  };
  for (let i = 0; i < 2; i++)
    await addDemand(adapter, [
      { ...item, hint: i === 0 ? 100000 : 200000 },
      { ...item, key: 'same-gap' },
      bottle,
    ]);
  expect(
    (await getInsights(deps, 'all')).gaps.some(
      (g) => g.key === 'headlamp|uv-protection',
    ),
  ).toBe(false);
  await addDemand(adapter, [{ ...item, hint: 300000 }, bottle]);
  const result = await getInsights(deps, 'all'),
    gap = result.gaps.find((g) => g.key === 'headlamp|uv-protection')!;
  expect(gap.thisWeek).toBe(3);
  expect(gap.priceBand).toEqual({ p25: 150000, p75: 250000 });
  expect(gap.neededWith).toEqual([{ category: 'water-bottle', share: 1 }]);
  const before = llm.calls.filter((c) =>
    c.messages.some((m) => m.content.includes('ONE advice sentence')),
  ).length;
  await addDemand(adapter, [item]);
  await getInsights(deps, 'all');
  expect(
    llm.calls.filter((c) =>
      c.messages.some((m) => m.content.includes('ONE advice sentence')),
    ).length,
  ).toBe(before + 1);
});
it('S3 groups differently tagged/labeled null categories into one ranked-label gap while recent preserves their labels', async () => {
  const adapter = new InMemoryAdapter(),
    llm = new SellerLLM();
  // Three differently labelled needs still form one gap; Cat food and Dog food are the two most frequent.
  for (let i = 0; i < 3; i++)
    await addDemand(adapter, [
      { key: 'bed', needLabel: 'Dog bed', category: null, tags: [] },
    ]);
  for (let i = 0; i < 21; i++)
    await addDemand(adapter, [
      {
        key: 'cat',
        needLabel: 'Cat food',
        category: null,
        tags: ['organic-cotton'],
      },
    ]);
  const result = await getInsights({ adapter, cache: adapter, llm }, 'all');
  const none = result.gaps.filter((g) => g.category === null);
  expect(none).toHaveLength(1);
  expect(none[0].key).toBe('none|');
  expect(none[0].tags).toEqual([]);
  expect(none[0].needLabel).toBe('Not in catalog: Cat food, Dog food');
  expect(none[0].thisWeek).toBe(44);
  expect(result.recent[0].needLabel).toBe('Cat food');
});
it('S3 recent strip contains newest unmet live items even below threshold, skips newer matched/seed rows and normalizes known gaps', async () => {
  const adapter = new InMemoryAdapter(),
    llm = new SellerLLM();
  await addDemand(adapter, [
    {
      key: 'backpack',
      needLabel: 'School backpack',
      category: 'school-backpack',
      tags: ['anti-hunchback'],
    },
  ]);
  const first = await getInsights(
    { adapter, cache: adapter, llm },
    'shop-minhan',
  );
  expect(first.recent[0].needLabel).toBe('Anti-hunchback backpack');
  await addDemand(adapter, [
    { key: 'puppy', needLabel: 'Puppy bed', category: null, tags: [] },
  ]);
  await addDemand(
    adapter,
    [{ key: 'seed', needLabel: 'Seed newer', category: null, tags: [] }],
    'seed',
  );
  for (let i = 0; i < 12; i++)
    await addDemand(adapter, [
      {
        key: 'matched',
        needLabel: 'Matched newer',
        category: 'headlamp',
        tags: [],
        matched: 8,
      },
    ]);
  const result = await getInsights(
    { adapter, cache: adapter, llm },
    'shop-minhan',
  );
  expect(result.recent[0].needLabel).toBe('Puppy bed');
  expect(
    result.recent.every(
      (r) => r.needLabel !== 'Seed newer' && r.needLabel !== 'Matched newer',
    ),
  ).toBe(true);
});
it('S3 applied fix stays a listing gap without judging candidates and undo restores unfixed state; all view sorts by count', async () => {
  const adapter = new InMemoryAdapter(),
    llm = new SellerLLM(),
    deps = { adapter, cache: adapter, llm };
  const before = await getInsights(deps, 'shop-minhan');
  const p = (await adapter.getProduct('prod-minhan-backpack'))!;
  await adapter.updateListing(p.id, {
    title: p.title,
    description: p.description,
    attributes: p.attributes,
    tags: [...p.tags, 'anti-hunchback'],
  });
  const fixed = await getInsights(deps, 'shop-minhan');
  expect(fixed.gaps[0]).toMatchObject({
    type: 'listing_gap',
    appliedFix: { productId: p.id, title: p.title },
  });
  const all = await getInsights(deps, 'all');
  expect(all.gaps.every((g) => g.appliedFix === null)).toBe(true);
  expect(all.gaps.map((g) => g.thisWeek)).toEqual(
    [...all.gaps.map((g) => g.thisWeek)].sort((a, b) => b - a),
  );
  await adapter.undoListing(p.id);
  expect(
    (await getInsights(deps, 'shop-minhan')).gaps[0].appliedFix,
  ).toBeNull();
  expect(before.gaps[0].appliedFix).toBeNull();
  const other = await getInsights(deps, 'shop-bago');
  expect(
    other.gaps.every(
      (g) =>
        g.candidates?.every((c) => c.productId !== 'prod-minhan-backpack') ??
        true,
    ),
  ).toBe(true);
});
it('S3 a live uncovered kit appears immediately with no visible gap below3sessions', async () => {
  const { runKit } = await import('@/server/pipeline');
  const { InMemoryKitStore } = await import('@/server/kits');
  const adapter = new InMemoryAdapter({ demand: [] });
  const puppy = {
    ...plan,
    event: 'other' as const,
    items: plan.items.slice(0, 3).map((i, index) => ({
      ...i,
      key: `puppy${index}`,
      category: null,
      needLabel: ['Dog food', 'Dog bed', 'Dog leash'][index],
    })),
  };
  for await (const e of runKit(
    { query: 'Puppy kit', owner: 'alice', persona: 'guest' },
    { adapter, store: new InMemoryKitStore(), llm: new FakeLLM([puppy]) },
  ))
    void e;
  const result = await getInsights(
    { adapter, cache: adapter, llm: new SellerLLM() },
    'all',
  );
  expect(result.gaps).toEqual([]);
  expect(result.recent[0].needLabel).toBe('Dog leash');
});
it('S3 first live hero query increases matching gap by exactly1, not one per repeated row', async () => {
  const { runKit } = await import('@/server/pipeline');
  const { InMemoryKitStore } = await import('@/server/kits');
  const adapter = new InMemoryAdapter(),
    deps = { adapter, cache: adapter, llm: new SellerLLM() };
  const before = (await getInsights(deps, 'shop-minhan')).gaps.find(
    (g) => g.key === 'school-backpack|anti-hunchback',
  )!;
  expect(before.thisWeek).toBe(10);
  expect(before.lastWeek).toBe(10);
  for await (const e of runKit(
    { query: 'Hero kit', owner: 'alice', persona: 'lan' },
    { adapter, store: new InMemoryKitStore(), llm: new FakeLLM([plan]) },
  ))
    void e;
  const after = (await getInsights(deps, 'shop-minhan')).gaps.find(
    (g) => g.key === before.key,
  )!;
  expect(after.thisWeek).toBe(11);
  expect(after.lastWeek).toBe(10);
});
it('S3 canonical seeded backpack label does not depend on generic planner/catalog labels', async () => {
  const adapter = new InMemoryAdapter({ demand: [] });
  for (let i = 0; i < 3; i++)
    await addDemand(adapter, [
      {
        key: 'bag',
        needLabel: 'School backpack',
        category: 'school-backpack',
        tags: ['anti-hunchback'],
        hint: 400000,
      },
    ]);
  const result = await getInsights(
    { adapter, cache: adapter, llm: new SellerLLM() },
    'shop-minhan',
  );
  expect(result.gaps[0].needLabel).toBe('Anti-hunchback backpack');
  expect(result.recent[0].needLabel).toBe('Anti-hunchback backpack');
});
