import { expect, it } from 'vitest';
import type { Candidate, KitPlan } from '@/contract/types';
import type { OptimizerInput } from '@/server/optimizer/types';
import { priceBasket } from '@/server/optimizer/pricing';
import { fitToBudget } from '@/server/optimizer/fit';
import { productSchema, shopSchema } from '@/contract/schemas';
import products from '@/contract/fixtures/products.json';
import shops from '@/contract/fixtures/shops.json';
function candidate(id: string, price: number, score = 0.8): Candidate {
  return {
    product: productSchema.parse({ ...products[0], id, price }),
    shop: shopSchema.parse({ ...shops[0], shipFee: 0 }),
    score,
    matchedTags: [],
    arrivesBy: '2026-09-04',
  };
}
function input(
  entries: [string, boolean, Candidate[]][],
  budget: number,
): OptimizerInput {
  const plan: KitPlan = {
    event: 'other',
    language: 'en',
    budget,
    deadline: null,
    assumptions: [],
    items: entries.map(([key, required]) => ({
      key,
      needLabel: key,
      category: 'school-backpack',
      required,
      quantity: 1,
      mustHaveTags: [],
      niceToHaveTags: [],
      maxUnitPrice: null,
    })),
  };
  return {
    plan,
    candidates: Object.fromEntries(entries.map(([key, , cs]) => [key, cs])),
    vouchers: [],
  };
}
it('drops an added-anyway item before touching optional or required lines and reprices its exact total', () => {
  const required = candidate('required-product', 300000);
  const extra = candidate('extra-product', 100000);
  const optional = candidate('optional-product', 50000);
  const i = input(
    [
      ['required', true, [required]],
      ['extra', false, []],
      ['optional', false, [optional]],
    ],
    350000,
  );
  const option = priceBasket(i, { required, extra, optional }, 'balanced');
  const suggestions = fitToBudget(i, option, ['extra']);
  expect(suggestions).toHaveLength(1);
  expect(suggestions[0]).toMatchObject({
    removeItemKeys: ['extra'],
    swaps: [],
    grandTotal: 350000,
    fits: true,
    dropsMustHave: false,
  });
  expect(suggestions[0].label).toContain('Drop extra');
});
it('drops optional items by quality per dong before repriced cheaper swaps, with Vietnamese move labels', () => {
  const expensive = candidate('expensive', 500000, 1);
  const cheap = candidate('cheap', 300000, 0.5);
  const firstDrop = candidate('low-value', 200000, 0.5);
  const secondDrop = candidate('high-value', 100000, 0.9);
  const i = input(
    [
      ['required', true, [expensive, cheap]],
      ['low', false, [firstDrop]],
      ['high', false, [secondDrop]],
    ],
    650000,
  );
  let option = priceBasket(
    i,
    { required: expensive, low: firstDrop, high: secondDrop },
    'premium',
  );
  expect(fitToBudget(i, option)[0]).toMatchObject({
    removeItemKeys: ['low'],
    swaps: [],
    grandTotal: 600000,
    dropsMustHave: false,
  });
  i.plan.budget = 350000;
  i.plan.language = 'vi';
  option = priceBasket(
    i,
    { required: expensive, low: firstDrop, high: secondDrop },
    'premium',
  );
  const result = fitToBudget(i, option);
  expect(result[0]).toMatchObject({
    removeItemKeys: ['low', 'high'],
    swaps: [{ itemKey: 'required', productId: 'cheap' }],
    grandTotal: 300000,
    fits: true,
    dropsMustHave: false,
  });
  expect(result[0].label).toContain('Bỏ low');
  expect(result[0].label).toContain('đổi required sang');
  expect(priceBasket(i, { required: cheap }, 'premium').grandTotal).toBe(
    result[0].grandTotal,
  );
});
it('flags required-item removal only after affordable swaps cannot fit and returns nothing for unlimited/in-budget kits', () => {
  const a = candidate('a', 300000);
  const cheapA = candidate('cheap-a', 200000, 0.5);
  const b = candidate('b', 100000);
  const i = input(
    [
      ['a', true, [a, cheapA]],
      ['b', true, [b]],
    ],
    150000,
  );
  const option = priceBasket(i, { a, b }, 'balanced');
  expect(fitToBudget(i, option)[0]).toMatchObject({
    removeItemKeys: ['a'],
    swaps: [],
    grandTotal: 100000,
    fits: true,
    dropsMustHave: true,
  });
  expect(
    fitToBudget({ ...i, plan: { ...i.plan, budget: null } }, option),
  ).toEqual([]);
  expect(
    fitToBudget({ ...i, plan: { ...i.plan, budget: 500000 } }, option),
  ).toEqual([]);
});
it('keeps required items when coordinated cheaper swaps fit despite each single swap raising shipping', () => {
  const atShop = (
    id: string,
    price: number,
    shopId: string,
    shipFee: number,
  ): Candidate => {
    const c = candidate(id, price);
    return {
      ...c,
      product: { ...c.product, shopId },
      shop: { ...c.shop, id: shopId, shipFee },
    };
  };
  const a = atShop('a-original', 100000, 'shop-a', 60000);
  const b = atShop('b-original', 100000, 'shop-b', 60000);
  const cheapA = atShop('a-cheap', 90000, 'shop-c', 100000);
  const cheapB = atShop('b-cheap', 90000, 'shop-c', 100000);
  const i = input(
    [
      ['a', true, [a, cheapA]],
      ['b', true, [b, cheapB]],
    ],
    300000,
  );
  const option = priceBasket(i, { a, b }, 'balanced');
  expect(option.grandTotal).toBe(320000);
  expect(priceBasket(i, { a: cheapA, b }, 'balanced').grandTotal).toBe(350000);
  const result = fitToBudget(i, option);
  expect(result[0]).toMatchObject({
    removeItemKeys: [],
    swaps: [
      { itemKey: 'a', productId: 'a-cheap' },
      { itemKey: 'b', productId: 'b-cheap' },
    ],
    grandTotal: 280000,
    fits: true,
    dropsMustHave: false,
  });
});
it('does not swap a quantity-three need to a cheaper product with only one unit in stock', () => {
  const a = candidate('a-stocked', 100000);
  const insufficient = candidate('one-left', 10000);
  insufficient.product.stock = 1;
  const i = input([['a', true, [a, insufficient]]], 100000);
  i.plan.items[0].quantity = 3;
  const option = priceBasket(i, { a }, 'balanced');
  const result = fitToBudget(i, option);
  expect(result[0]).toMatchObject({
    removeItemKeys: ['a'],
    swaps: [],
    dropsMustHave: true,
    grandTotal: 0,
  });
});
