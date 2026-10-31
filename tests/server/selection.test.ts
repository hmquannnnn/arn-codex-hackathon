import { expect, it } from 'vitest';
import { InMemoryAdapter } from '@/server/commerce';
import { matchPlan } from '@/server/matcher';
import { priceSelection } from '@/server/optimizer/selection';
import { kitPlanSchema } from '@/contract/schemas';
import fixture from '@/contract/fixtures/kit.sample.json';
const hero = kitPlanSchema.parse(
  fixture.find((e) => e.event === 'plan')!.data.plan,
);
it('S9 Add anyway uses closest shop shipping/vouchers; randomized selections balance and fit suggestions replay under budget', async () => {
  const adapter = new InMemoryAdapter();
  const plan = { ...hero, budget: 1000000 };
  const matched = await matchPlan(plan, adapter),
    vouchers = await adapter.listVouchers('lan');
  const gap = matched.noMatch.find(
    (g) => g.closest?.candidate.product.id === 'prod-minhan-backpack',
  )!;
  const picks = { [gap.itemKey]: 'prod-minhan-backpack' };
  const option = priceSelection(
    plan,
    matched,
    { profile: 'balanced', picks, dropped: [] },
    vouchers,
  );
  expect(option.lines.find((l) => l.itemKey === gap.itemKey)?.shop.id).toBe(
    'shop-minhan',
  );
  expect(option.noMatch.some((g) => g.itemKey === gap.itemKey)).toBe(false);
  for (let seed = 0; seed < 25; seed++) {
    const chosen = Object.fromEntries(
      plan.items.flatMap((item, index) => {
        const pool = matched.candidates[item.key];
        return pool?.length
          ? [[item.key, pool[(seed * 7 + index) % pool.length].product.id]]
          : [];
      }),
    );
    const selection = {
      profile: 'balanced' as const,
      picks: { ...chosen, ...picks },
      dropped: [] as string[],
    };
    const priced = priceSelection(plan, matched, selection, vouchers);
    expect(priced.grandTotal).toBe(
      priced.itemsTotal + priced.shippingTotal - priced.discountTotal,
    );
    expect(priced.savings.reduce((sum, s) => sum + s.amount, 0)).toBe(
      priced.discountTotal,
    );
    if (priced.status === 'over_budget') {
      expect(priced.overBy).toBe(priced.grandTotal - 1000000);
      expect(priced.fit?.length).toBeGreaterThan(0);
      for (const fit of priced.fit!) {
        const next = priceSelection(
          plan,
          matched,
          {
            ...selection,
            picks: {
              ...selection.picks,
              ...Object.fromEntries(
                fit.swaps.map((s) => [s.itemKey, s.productId]),
              ),
            },
            dropped: fit.removeItemKeys,
          },
          vouchers,
        );
        expect(next.grandTotal).toBe(fit.grandTotal);
        expect(next.grandTotal).toBeLessThanOrEqual(1000000);
      }
    }
  }
});
it('S9 a deliberately expensive hero swap exceeds1M and has an executable fit', async () => {
  const adapter = new InMemoryAdapter(),
    plan = { ...hero, budget: 1000000 };
  const matched = await matchPlan(plan, adapter),
    vouchers = await adapter.listVouchers('lan');
  const selection = {
    profile: 'balanced' as const,
    picks: Object.fromEntries(
      Object.entries(matched.candidates)
        .filter(([, pool]) => pool.length)
        .map(([key, pool]) => [
          key,
          [...pool].sort((a, b) => b.product.price - a.product.price)[0].product
            .id,
        ]),
    ),
    dropped: [] as string[],
  };
  const option = priceSelection(plan, matched, selection, vouchers);
  expect(option.status).toBe('over_budget');
  expect(option.fit?.length).toBeGreaterThan(0);
  const fit = option.fit![0];
  expect(
    priceSelection(
      plan,
      matched,
      {
        ...selection,
        picks: {
          ...selection.picks,
          ...Object.fromEntries(fit.swaps.map((s) => [s.itemKey, s.productId])),
        },
        dropped: fit.removeItemKeys,
      },
      vouchers,
    ).grandTotal,
  ).toBeLessThanOrEqual(1000000);
});

it('B9 over-budget selected total is distinct from the achievable minimum and has cost drivers', async () => {
  const adapter = new InMemoryAdapter();
  const plan = { ...hero, budget: 1000000 };
  const matched = await matchPlan(plan, adapter);
  const selection = {
    profile: 'balanced' as const,
    dropped: [],
    picks: Object.fromEntries(
      Object.entries(matched.candidates)
        .filter(([, pool]) => pool.length)
        .map(([key, pool]) => [
          key,
          [...pool].sort((a, b) => b.product.price - a.product.price)[0].product
            .id,
        ]),
    ),
  };
  const option = priceSelection(
    plan,
    matched,
    selection,
    await adapter.listVouchers('lan'),
  );
  expect(option.grandTotal).toBe(1210000);
  expect(option.minimumCost).toBe(598500);
  expect(option.costDrivers?.length).toBeGreaterThan(0);
  expect(option.minimumCost).toBeLessThan(option.fit![0].grandTotal);
});

it('catalog cart context permits explicitly adding the offered closest product; cart-only still rejects it', async () => {
  const adapter = new InMemoryAdapter();
  const plan = {
    ...hero,
    shopping: { source: 'catalog' as const, cart: [], keepProductIds: [] },
  };
  const matched = await matchPlan(plan, adapter);
  const gap = matched.noMatch.find((g) => g.closest)!;
  const id = gap.closest!.candidate.product.id;
  const selection = {
    profile: 'balanced' as const,
    picks: { [gap.itemKey]: id },
    dropped: [],
  };
  const option = priceSelection(plan, matched, selection, []);
  expect(
    option.lines.some((l) => l.itemKey === gap.itemKey && l.product.id === id),
  ).toBe(true);
  expect(option.noMatch.some((g) => g.itemKey === gap.itemKey)).toBe(false);
  expect(() =>
    priceSelection(
      { ...plan, shopping: { ...plan.shopping, source: 'cart_only' } },
      matched,
      selection,
      [],
    ),
  ).toThrow('Product is not offered');
});
