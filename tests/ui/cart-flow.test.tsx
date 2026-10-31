import { expect, it } from 'vitest';
import { mergeKit, subtractPurchased } from '@/lib/client/cart-flow';
import products from '@/contract/fixtures/products.json';
import shops from '@/contract/fixtures/shops.json';
import { productSchema, shopSchema } from '@/contract/schemas';
const line = (index: number, quantity: number) => ({
  product: productSchema.parse(products[index]),
  shop: shopSchema.parse(shops.find((s) => s.id === products[index].shopId)),
  quantity,
});
it('confirmation merges without duplicates and preserves unrelated cart items', () => {
  const before = [line(0, 2), line(1, 1)];
  const merged = mergeKit(before, [line(0, 1), line(2, 1)]);
  expect(merged.map((l) => [l.product.id, l.quantity])).toEqual([
    [before[0].product.id, 2],
    [before[1].product.id, 1],
    [products[2].id, 1],
  ]);
  expect(mergeKit(merged, [line(0, 1), line(2, 1)])).toEqual(merged);
});
it('checkout consumes only purchased quantities, keeping leftovers and unselected items', () => {
  const before = [line(0, 3), line(1, 1)];
  expect(
    subtractPurchased(before, [{ productId: products[0].id, quantity: 1 }]).map(
      (l) => l.quantity,
    ),
  ).toEqual([2, 1]);
  expect(
    subtractPurchased(before, [{ productId: products[0].id, quantity: 3 }]),
  ).toEqual([before[1]]);
});
import { afterEach } from 'vitest';
import { cleanup, render, screen, fireEvent } from '@testing-library/react';
import { CartKitSetup } from '@/components/kit/cart-setup';
afterEach(cleanup);
it('lets buyers restrict sourcing and explicitly keep a saved product', () => {
  let source = 'catalog';
  let kept: string[] = [];
  render(
    <CartKitSetup
      lines={[line(0, 2)]}
      source="catalog"
      keepProductIds={[]}
      onSource={(value) => {
        source = value;
      }}
      onKeep={(value) => {
        kept = value;
      }}
    />,
  );
  fireEvent.change(screen.getByLabelText('Choose products from'), {
    target: { value: 'cart_only' },
  });
  expect(source).toBe('cart_only');
  fireEvent.click(screen.getByLabelText(`Keep ${products[0].title}`));
  expect(kept).toEqual([products[0].id]);
  expect(
    screen.getByText(/Recommendations leave your cart unchanged/),
  ).toBeTruthy();
});
import { kitPurchases } from '@/lib/client/cart-flow';
it('checkout selection combines repeated kit products into their total desired quantity', () => {
  expect(kitPurchases([line(0, 1), line(0, 2)])).toEqual([
    { productId: products[0].id, quantity: 3 },
  ]);
});
