import { expect, it } from 'vitest';
import { kitRequestSchema, kitPlanSchema } from '@/contract/schemas';
import sample from '@/contract/fixtures/kit.sample.json';
it('retains bounded cart context across request and plan validation', () => {
  const shopping = {
    source: 'cart_only',
    cart: [{ productId: 'saved', quantity: 2 }],
    keepProductIds: ['saved'],
  };
  expect(
    kitRequestSchema.parse({ query: 'School kit', shopping }),
  ).toHaveProperty('shopping', shopping);
  expect(
    kitPlanSchema.parse({
      ...sample.find((event) => event.event === 'plan')!.data.plan,
      shopping,
    }),
  ).toHaveProperty('shopping', shopping);
});
it('rejects duplicate cart rows, missing keeps and unbounded quantities', () => {
  const parse = (cart: unknown[], keepProductIds: string[] = []) =>
    kitRequestSchema.safeParse({
      query: 'School',
      shopping: { source: 'cart_only', cart, keepProductIds },
    }).success;
  expect(
    parse([
      { productId: 'a', quantity: 1 },
      { productId: 'a', quantity: 1 },
    ]),
  ).toBe(false);
  expect(parse([], ['a'])).toBe(false);
  expect(parse([{ productId: 'a', quantity: 1000 }])).toBe(false);
});
