import { afterEach, expect, it, vi } from 'vitest';
import { matchPlan } from '@/server/matcher';
import { InMemoryAdapter } from '@/server/commerce';
import type { ProductQuery } from '@/contract/commerce-adapter';
import type { KitPlan, PlanItem } from '@/contract/types';

class ObservedMemoryAdapter extends InMemoryAdapter {
  readonly queries: ProductQuery[] = [];
  shopReads = 0;
  override async searchProducts(query: ProductQuery) {
    this.queries.push(structuredClone(query));
    return super.searchProducts(query);
  }
  override async listShops() {
    this.shopReads++;
    return super.listShops();
  }
}
function need(
  key: string,
  category: string | null,
  mustHaveTags: string[] = [],
  maxUnitPrice: number | null = null,
): PlanItem {
  return {
    key,
    needLabel: key,
    category,
    mustHaveTags,
    maxUnitPrice,
    required: true,
    quantity: 1,
    niceToHaveTags: [],
  };
}
function plan(
  items: PlanItem[],
  deadline: string | null = '2026-09-05',
): KitPlan {
  return {
    event: 'back_to_school',
    language: 'en',
    budget: 1500000,
    deadline,
    items,
    assumptions: [],
  };
}
afterEach(() => vi.unstubAllEnvs());
it('searches the whole plan once and returns the honest hero closest without admitting it to exact candidates', async () => {
  vi.stubEnv('DEMO_TODAY', '2026-09-02');
  const adapter = new ObservedMemoryAdapter();
  const result = await matchPlan(
    plan([
      need('backpack', 'school-backpack', ['anti-hunchback'], 400000),
      need('pens', 'pencils-pens'),
      need('pens-again', 'pencils-pens'),
      need('pet', null),
    ]),
    adapter,
  );
  expect(adapter.queries).toEqual([
    { categories: ['school-backpack', 'pencils-pens'] },
  ]);
  expect(adapter.shopReads).toBe(1);
  expect(result.candidates.backpack).toEqual([]);
  expect(result.matchedCounts.backpack).toBe(0);
  expect(
    result.noMatch.find((gap) => gap.itemKey === 'backpack'),
  ).toMatchObject({
    reason: 'none_in_budget',
    closest: {
      candidate: { product: { id: 'prod-minhan-backpack' } },
      missingTags: ['anti-hunchback'],
      overMaxPriceBy: null,
    },
  });
  expect(result.noMatch.find((gap) => gap.itemKey === 'pet')).toMatchObject({
    reason: 'no_category',
    closest: null,
  });
  expect(result.candidates.pens).toHaveLength(2);
  expect(result.matchedCounts.pens).toBe(2);
  expect(result.comparedProducts).toBe(9);
  expect(result.comparedShops).toBe(4);
});

it('filters deadline, every required tag, unit price and stock quantity while preserving price-free quality', async () => {
  vi.stubEnv('DEMO_TODAY', '2026-09-02');
  const adapter = new InMemoryAdapter();
  const limited = await matchPlan(
    plan([need('cheap', 'school-backpack', [], 250000)]),
    adapter,
  );
  expect(limited.noMatch[0].reason).toBe('none_in_budget');
  const timeless = await matchPlan(
    plan([need('cheap', 'school-backpack', [], 250000)], null),
    adapter,
  );
  expect(timeless.candidates.cheap.map((c) => c.product.id)).toEqual([
    'prod-bago-backpack-1',
    'prod-bago-backpack-2',
    'prod-bago-backpack-3',
  ]);
  expect(new Set(timeless.candidates.cheap.map((c) => c.score)).size).toBe(1);
  const tags = await matchPlan(
    plan([need('both', 'school-backpack', ['kids', 'lightweight'], 500000)]),
    adapter,
  );
  expect(tags.candidates.both.map((c) => c.product.id)).toEqual([
    'prod-homie-backpack',
  ]);
  expect(tags.candidates.both[0].arrivesBy).toBe('2026-09-05');
  const noTime = await matchPlan(
    plan([need('early', 'school-backpack')], '2026-09-02'),
    adapter,
  );
  expect(noTime.noMatch[0]).toMatchObject({
    reason: 'none_in_time',
    closest: null,
  });
  const unavailable = need('many', 'school-backpack');
  unavailable.quantity = 121;
  const noStock = await matchPlan(plan([unavailable]), adapter);
  expect(noStock.candidates.many).toEqual([]);
  expect(noStock.noMatch[0].closest).toBeNull();
});

it('orders by canonical quality weights and gives a priced closest only after tag relaxation fails', async () => {
  vi.stubEnv('DEMO_TODAY', '2026-09-02');
  const adapter = new InMemoryAdapter();
  const withPreferences = need('backpack', 'school-backpack', [], 600000);
  withPreferences.niceToHaveTags = ['kids', 'lightweight'];
  const result = await matchPlan(
    plan([
      withPreferences,
      need('bottle', 'water-bottle', ['insulated'], 50000),
    ]),
    adapter,
  );
  expect(result.candidates.backpack[0].product.id).toBe(
    'prod-kidzone-lite-backpack',
  );
  expect(result.candidates.backpack[0].score).toBeCloseTo(0.94835, 4);
  expect(result.candidates.backpack[0].matchedTags).toEqual([
    'kids',
    'lightweight',
  ]);
  expect(result.noMatch[0]).toMatchObject({
    reason: 'no_product_with_tags',
    closest: {
      candidate: {
        product: { id: 'prod-kidzone-water-bottle', price: 170000 },
      },
      missingTags: ['insulated'],
      overMaxPriceBy: 120000,
    },
  });
  expect(result.matchedCounts.bottle).toBe(0);
});
