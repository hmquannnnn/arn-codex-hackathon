import { expect, it } from 'vitest';
import { InMemoryAdapter } from '@/server/commerce';
import { matchPlan } from '@/server/matcher';
import { optimizeProfiles } from '@/server/optimizer';
import { priceSelection } from '@/server/optimizer/selection';
import { kitPlanSchema } from '@/contract/schemas';
import threads from '@/contract/fixtures/threads.sample.json';
const plan = () => ({
  ...kitPlanSchema.parse(threads[0].versions[0].plan),
  deadline: null,
  budget: 800000,
  items: [
    {
      key: 'backpack',
      needLabel: 'Backpack',
      category: 'school-backpack',
      quantity: 1,
      required: true,
      mustHaveTags: [],
      niceToHaveTags: [],
      maxUnitPrice: null,
    },
  ],
});
it('cart-only uses quantities, keeps, gaps and never offers outside-cart swaps', async () => {
  const p = {
    ...plan(),
    shopping: {
      source: 'cart_only' as const,
      cart: [{ productId: 'prod-kidzone-lite-backpack', quantity: 1 }],
      keepProductIds: [],
    },
  };
  const adapter = new InMemoryAdapter();
  const matched = await matchPlan(p, adapter);
  expect(matched.candidates.backpack.map((c) => c.product.id)).toEqual([
    'prod-kidzone-lite-backpack',
  ]);
  const options = optimizeProfiles({ plan: p, ...matched, vouchers: [] });
  expect(
    options.every(
      (o) => o.lines[0].product.id === 'prod-kidzone-lite-backpack',
    ),
  ).toBe(true);
  expect(() =>
    priceSelection(
      p,
      matched,
      {
        profile: 'balanced',
        picks: { backpack: 'prod-minhan-backpack' },
        dropped: [],
      },
      [],
    ),
  ).toThrow();
  p.items[0].quantity = 2;
  expect((await matchPlan(p, adapter)).candidates.backpack).toEqual([]);
});
it('small cart bonus follows hard filters and is absent in cart-only mode', async () => {
  const adapter = new InMemoryAdapter();
  const p = plan();
  const baseline = await matchPlan(p, adapter);
  const shopping = {
    source: 'catalog' as const,
    cart: [{ productId: 'prod-kidzone-lite-backpack', quantity: 1 }],
    keepProductIds: [],
  };
  const biased = await matchPlan({ ...p, shopping }, adapter);
  const score = (m: typeof baseline) =>
    m.candidates.backpack.find(
      (c) => c.product.id === 'prod-kidzone-lite-backpack',
    )!.score;
  expect(score(biased) - score(baseline)).toBeCloseTo(0.02);
  const only = await matchPlan(
    { ...p, shopping: { ...shopping, source: 'cart_only' } },
    adapter,
  );
  expect(score(only)).toBe(score(baseline));
  p.items[0].mustHaveTags = ['anti-hunchback'];
  const hard = await matchPlan(
    {
      ...p,
      shopping: { ...shopping, keepProductIds: ['prod-kidzone-lite-backpack'] },
    },
    adapter,
  );
  expect(hard.candidates.backpack).toEqual([]);
  expect(hard.noMatch[0].needLabel).toContain('Keep conflict');
});
it('a kept product remains selected even under budget pressure', async () => {
  const adapter = new InMemoryAdapter();
  const p = {
    ...plan(),
    budget: 100000,
    shopping: {
      source: 'catalog' as const,
      cart: [{ productId: 'prod-kidzone-lite-backpack', quantity: 1 }],
      keepProductIds: ['prod-kidzone-lite-backpack'],
    },
  };
  const matched = await matchPlan(p, adapter);
  const options = optimizeProfiles({ plan: p, ...matched, vouchers: [] });
  expect(
    options.every(
      (o) =>
        o.status === 'over_budget' &&
        o.lines[0].product.id === 'prod-kidzone-lite-backpack',
    ),
  ).toBe(true);
});
it('never spends the same saved quantity twice across checklist items', async () => {
  const p = plan();
  p.items.push({ ...p.items[0], key: 'second-backpack' });
  const scoped = {
    ...p,
    shopping: {
      source: 'cart_only' as const,
      cart: [{ productId: 'prod-kidzone-lite-backpack', quantity: 1 }],
      keepProductIds: [],
    },
  };
  const matched = await matchPlan(scoped, new InMemoryAdapter());
  const options = optimizeProfiles({ plan: scoped, ...matched, vouchers: [] });
  for (const o of options) {
    expect(o.lines.reduce((sum, line) => sum + line.quantity, 0)).toBe(1);
    expect(o.noMatch).toHaveLength(1);
  }
});
it('keeps an explicitly retained optional product when the budget is too small', async () => {
  const p = plan();
  p.items[0].required = false;
  const scoped = {
    ...p,
    budget: 100000,
    shopping: {
      source: 'catalog' as const,
      cart: [{ productId: 'prod-kidzone-lite-backpack', quantity: 1 }],
      keepProductIds: ['prod-kidzone-lite-backpack'],
    },
  };
  const matched = await matchPlan(scoped, new InMemoryAdapter());
  expect(
    optimizeProfiles({ plan: scoped, ...matched, vouchers: [] }).every(
      (o) => o.lines.length === 1 && o.status === 'over_budget',
    ),
  ).toBe(true);
});
it('offers saved alternatives even when they share a shop', async () => {
  const original = (await new InMemoryAdapter().getProduct(
    'prod-kidzone-lite-backpack',
  ))!;
  const alternative = {
    ...original,
    id: 'same-shop-alternative',
    price: 510000,
  };
  const adapter = new InMemoryAdapter({ products: [original, alternative] });
  const scoped = {
    ...plan(),
    shopping: {
      source: 'cart_only' as const,
      cart: [
        { productId: original.id, quantity: 1 },
        { productId: alternative.id, quantity: 1 },
      ],
      keepProductIds: [],
    },
  };
  const matched = await matchPlan(scoped, adapter);
  const option = optimizeProfiles({
    plan: scoped,
    ...matched,
    vouchers: [],
  })[0];
  expect(option.lines[0].alternatives.map((c) => c.product.id)).toContain(
    original.id,
  );
});
