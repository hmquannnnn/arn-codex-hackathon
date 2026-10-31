import { afterEach, expect, it, vi } from 'vitest';
import type { Candidate, KitPlan } from '@/contract/types';
import { priceBasket } from '@/server/optimizer/pricing';
import type { OptimizerInput } from '@/server/optimizer/types';
import { productSchema, shopSchema } from '@/contract/schemas';
import products from '@/contract/fixtures/products.json';
import shops from '@/contract/fixtures/shops.json';

function candidate(
  id: string,
  price: number,
  shopId = 'shop-minhan',
  score = 0.8,
): Candidate {
  return {
    product: productSchema.parse({ ...products[0], id, price, shopId }),
    shop: shopSchema.parse({
      ...shops.find((s) => s.id === shopId)!,
      shipFee: 20000,
    }),
    score,
    matchedTags: [],
    arrivesBy: '2026-09-04',
  };
}
function input(candidates: Record<string, Candidate[]>): OptimizerInput {
  const plan: KitPlan = {
    event: 'other',
    language: 'en',
    budget: 1000000,
    deadline: '2026-09-05',
    assumptions: [],
    items: Object.keys(candidates).map((key) => ({
      key,
      needLabel: key,
      category: 'school-backpack',
      required: true,
      quantity: 1,
      mustHaveTags: [],
      niceToHaveTags: [],
      maxUnitPrice: null,
    })),
  };
  return { plan, candidates, vouchers: [] };
}
afterEach(() => vi.unstubAllEnvs());
it('prices quantities with one shipping fee per shop and real discounts only', () => {
  const a = candidate('a', 100000);
  const b = candidate('b', 150000);
  const i = input({ a: [a], b: [b] });
  i.plan.items[0].quantity = 2;
  const result = priceBasket(i, { a, b }, 'balanced');
  expect(result).toMatchObject({
    itemsTotal: 350000,
    shippingTotal: 20000,
    discountTotal: 0,
    grandTotal: 370000,
    savings: [],
    status: 'ok',
  });
  expect(result.shops).toEqual([
    {
      shopId: 'shop-minhan',
      shopName: a.shop.name,
      subtotal: 350000,
      shipping: 20000,
      shopDiscount: 0,
      voucherCodes: [],
    },
  ]);
  expect(result.lines.map((line) => line.lineTotal)).toEqual([200000, 150000]);
});
it('combines one best shop voucher, one platform discount and freeship without double-counting', () => {
  vi.stubEnv('DEMO_TODAY', '2026-09-02');
  const a = candidate('a', 600000);
  const i = input({ a: [a] });
  i.vouchers = [
    {
      id: 'shop-small',
      code: 'SHOP10',
      scope: 'shop',
      shopId: 'shop-minhan',
      kind: 'fixed',
      value: 10000,
      maxDiscount: null,
      minSpend: 100000,
      validUntil: '2026-09-02',
      ownerPersona: null,
      label: 'Small shop',
    },
    {
      id: 'shop-best',
      code: 'SHOP30',
      scope: 'shop',
      shopId: 'shop-minhan',
      kind: 'percent',
      value: 10,
      maxDiscount: 30000,
      minSpend: 500000,
      validUntil: '2026-09-02',
      ownerPersona: null,
      label: 'Shop capped',
    },
    {
      id: 'platform-small',
      code: 'SAVE5',
      scope: 'platform',
      shopId: null,
      kind: 'percent',
      value: 5,
      maxDiscount: 40000,
      minSpend: 500000,
      validUntil: '2026-09-02',
      ownerPersona: null,
      label: 'Save 5%',
    },
    {
      id: 'wallet',
      code: 'LAN-BTS10',
      scope: 'platform',
      shopId: null,
      kind: 'percent',
      value: 10,
      maxDiscount: 100000,
      minSpend: 500000,
      validUntil: '2026-09-02',
      ownerPersona: 'lan',
      label: 'Back-to-school 10%',
    },
    {
      id: 'ship',
      code: 'FREESHIP',
      scope: 'platform',
      shopId: null,
      kind: 'freeship',
      value: 30000,
      maxDiscount: null,
      minSpend: 200000,
      validUntil: '2026-09-02',
      ownerPersona: null,
      label: 'Free shipping',
    },
    {
      id: 'expired',
      code: 'EXPIRED',
      scope: 'platform',
      shopId: null,
      kind: 'fixed',
      value: 500000,
      maxDiscount: null,
      minSpend: 0,
      validUntil: '2026-09-01',
      ownerPersona: null,
      label: 'Expired',
    },
    {
      id: 'threshold',
      code: 'TOO-HIGH',
      scope: 'platform',
      shopId: null,
      kind: 'fixed',
      value: 500000,
      maxDiscount: null,
      minSpend: 700000,
      validUntil: '2026-09-30',
      ownerPersona: null,
      label: 'Threshold',
    },
  ];
  const result = priceBasket(i, { a }, 'balanced');
  expect(result).toMatchObject({
    itemsTotal: 600000,
    shippingTotal: 20000,
    discountTotal: 107000,
    grandTotal: 513000,
  });
  expect(result.shops[0]).toMatchObject({
    shopDiscount: 30000,
    voucherCodes: ['SHOP30', 'FREESHIP'],
  });
  expect(result.savings.find((saving) => saving.wallet)).toEqual({
    label: 'Your wallet voucher Back-to-school 10%',
    amount: 57000,
    wallet: true,
  });
  expect(result.savings.reduce((sum, saving) => sum + saving.amount, 0)).toBe(
    107000,
  );
  const guest = priceBasket(
    { ...i, vouchers: i.vouchers.filter((v) => !v.ownerPersona) },
    { a },
    'balanced',
  );
  expect(guest.grandTotal).toBe(541500);
  i.plan.language = 'vi';
  expect(
    priceBasket(i, { a }, 'balanced').savings.find((saving) => saving.wallet)
      ?.label,
  ).toBe('Voucher trong ví của bạn Back-to-school 10%');
});
it('preserves matcher gaps, lists budget-skipped optional items and picks diverse quality alternatives', () => {
  const a = candidate('chosen', 100000);
  const sameShop = candidate('same-shop', 90000, 'shop-minhan', 1);
  const alt1 = candidate('alt1', 110000, 'shop-kidzone', 0.9);
  const alt2 = candidate('alt2', 120000, 'shop-kidzone', 0.85);
  const alt3 = candidate('alt3', 90000, 'shop-bago', 0.7);
  const i = input({
    a: [a, sameShop, alt1, alt2, alt3],
    optional: [a],
    missing: [],
  });
  i.plan.items[1].required = false;
  i.noMatch = [
    {
      itemKey: 'missing',
      needLabel: 'missing',
      reason: 'none_in_time',
      closest: null,
    },
  ];
  const result = priceBasket(i, { a }, 'saver');
  expect(result.lines[0].alternatives.map((c) => c.product.id)).toEqual([
    'alt1',
    'alt3',
  ]);
  expect(result.lines[0].reason).toContain('2026-09-04');
  expect(result.noMatch).toEqual(i.noMatch);
  expect(result.skipped).toEqual([
    { itemKey: 'optional', needLabel: 'optional', reason: 'budget' },
  ]);
  i.noMatch = [];
  expect(priceBasket(i, { a }, 'saver').noMatch).toEqual([
    {
      itemKey: 'missing',
      needLabel: 'missing',
      reason: 'no_product_with_tags',
      closest: null,
    },
  ]);
});
