import { expect, it } from 'vitest';
import { optimize, optimizeProfiles } from '@/server/optimizer';
import type { OptimizerInput } from '@/server/optimizer/types';
import { productSchema } from '@/contract/schemas';
import type { Candidate, PlanItem } from '@/contract/types';
import products from '@/contract/fixtures/products.json';
import shops from '@/contract/fixtures/shops.json';

function candidate(
  id: string,
  price: number,
  score: number,
  shop = 'a',
  fee = 20000,
): Candidate {
  return {
    product: productSchema.parse({
      ...products[0],
      id,
      title: id,
      shopId: shop,
      price,
      stock: 99,
    }),
    shop: { ...shops[0], id: shop, shipFee: fee, tier: 'regular' },
    score,
    matchedTags: [],
    arrivesBy: '2026-09-04',
  };
}
function item(key: string, required = true): PlanItem {
  return {
    key,
    required,
    needLabel: key,
    category: 'school-backpack',
    quantity: 1,
    mustHaveTags: [],
    niceToHaveTags: [],
    maxUnitPrice: null,
  };
}
function input(
  candidates: Record<string, Candidate[]>,
  budget: number | null = 1000000,
  optional: string[] = [],
): OptimizerInput {
  return {
    plan: {
      event: 'back_to_school',
      language: 'en',
      budget,
      deadline: '2026-09-05',
      assumptions: [],
      items: Object.keys(candidates).map((key) =>
        item(key, !optional.includes(key)),
      ),
    },
    candidates,
    vouchers: [],
  };
}
it('saver prices complete combinations and consolidates when a second shipping fee costs more', () => {
  const world = input({
    a: [
      candidate('a-low', 100000, 0.5, 'a'),
      candidate('a-high', 110000, 0.8, 'b'),
    ],
    b: [candidate('b', 100000, 0.8, 'b')],
  });
  const result = optimize(world, 'saver');
  expect(result.lines.map((line) => line.product.id)).toEqual(['a-high', 'b']);
  expect(result.grandTotal).toBe(230000);
  expect(result.shippingTotal).toBe(20000);
  expect(result.savings).toEqual([]);
});
it('selects distinct quality and cost objectives from the same item set within budget', () => {
  const world = input(
    {
      a: [candidate('a-low', 100000, 0.5), candidate('a-high', 200000, 0.9)],
      b: [candidate('b-low', 100000, 0.5), candidate('b-high', 200000, 0.9)],
    },
    420000,
  );
  const [saver, balanced, premium] = optimizeProfiles(world);
  expect(saver.grandTotal).toBe(220000);
  expect(premium.grandTotal).toBe(420000);
  expect(premium.lines.map((line) => line.product.id)).toEqual([
    'a-high',
    'b-high',
  ]);
  expect(balanced.grandTotal).toBeGreaterThanOrEqual(saver.grandTotal);
  expect(balanced.grandTotal).toBeLessThanOrEqual(premium.grandTotal);
  world.plan.budget = 320000;
  const tight = optimize(world, 'premium');
  expect(tight.grandTotal).toBe(320000);
  expect(
    tight.lines.filter((line) => line.product.id.endsWith('high')),
  ).toHaveLength(1);
  world.plan.budget = null;
  expect(
    optimize(world, 'premium').lines.map((line) => line.product.id),
  ).toEqual(['a-high', 'b-high']);
});
it('drops low quality-per-price optional items first and preserves the same set for every profile', () => {
  const world = input(
    {
      required: [candidate('required', 100000, 0.6)],
      weak: [candidate('weak', 100000, 0.2)],
      useful: [candidate('useful', 50000, 0.8)],
    },
    170000,
    ['weak', 'useful'],
  );
  for (const option of optimizeProfiles(world)) {
    expect(option.status).toBe('ok');
    expect(option.grandTotal).toBe(170000);
    expect(option.lines.map((line) => line.itemKey)).toEqual([
      'required',
      'useful',
    ]);
    expect(option.skipped).toEqual([
      { itemKey: 'weak', needLabel: 'weak', reason: 'budget' },
    ]);
  }
});
it('excludes late and insufficient-stock candidates and preserves explicit matcher reasons', () => {
  const late = candidate('late', 1000, 1);
  late.arrivesBy = '2026-09-06';
  const sold = candidate('sold', 1000, 1);
  sold.product.stock = 0;
  const world = input({
    a: [late, sold, candidate('valid', 100000, 0.5)],
    missing: [],
  });
  world.noMatch = [
    {
      itemKey: 'missing',
      needLabel: 'missing',
      reason: 'none_in_time',
      closest: null,
    },
  ];
  const result = optimize(world, 'premium');
  expect(result.lines.map((line) => line.product.id)).toEqual(['valid']);
  expect(result.noMatch).toEqual(world.noMatch);
});
it('reports honest minimum required cost and top cost drivers when no basket fits', () => {
  const world = input(
    {
      a: [candidate('a', 100000, 0.4)],
      b: [candidate('b', 200000, 0.9)],
      optional: [candidate('extra', 50000, 0.7)],
    },
    100000,
    ['optional'],
  );
  const result = optimize(world);
  expect(result.status).toBe('over_budget');
  expect(result.grandTotal).toBe(320000);
  expect(result.minimumCost).toBe(320000);
  expect(result.overBy).toBe(220000);
  expect(result.costDrivers).toHaveLength(2);
  expect(result.costDrivers?.[0]).toContain('b');
  expect(result.fit?.length).toBeGreaterThan(0);
});
it('optimizes twelve items with eight candidates deterministically within 200ms', () => {
  const world = input(
    Object.fromEntries(
      Array.from({ length: 12 }, (_, i) => [
        `item-${i}`,
        Array.from({ length: 8 }, (_, j) =>
          candidate(
            `product-${i}-${j}`,
            100000 + j * 25000,
            0.35 + j * 0.08,
            `shop-${j % 3}`,
          ),
        ),
      ]),
    ),
    5000000,
  );
  const start = performance.now();
  const options = optimizeProfiles(world);
  expect(performance.now() - start).toBeLessThan(200);
  expect(options).toHaveLength(3);
  expect(
    options.every(
      (option) => option.status === 'ok' && option.lines.length === 12,
    ),
  ).toBe(true);
  expect(optimizeProfiles(world)).toEqual(options);
});
