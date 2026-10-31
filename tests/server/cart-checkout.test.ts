import { expect, it } from 'vitest';
import { quoteCart } from '@/server/cart/checkout';
import { InMemoryAdapter } from '@/server/commerce';
it('reprices selected quantities with exact shipping and eligible persona vouchers', async () => {
  const adapter = new InMemoryAdapter();
  const lines = [{ productId: 'prod-kidzone-lite-backpack', quantity: 1 }];
  const lan = await quoteCart(adapter, lines, 'lan');
  const guest = await quoteCart(adapter, lines, 'guest');
  expect(lan.grandTotal).toBe(
    lan.itemsTotal + lan.shippingTotal - lan.discountTotal,
  );
  expect(lan.savings.some((s) => s.wallet)).toBe(true);
  expect(guest.savings.some((s) => s.wallet)).toBe(false);
  expect(lan.grandTotal).toBeLessThan(guest.grandTotal);
  expect(lan.lines).toHaveLength(1);
});
it('checks aggregate stock and current catalog prices instead of trusting browser snapshots', async () => {
  const adapter = new InMemoryAdapter();
  const product = (await adapter.getProduct('prod-kidzone-lite-backpack'))!;
  await expect(
    quoteCart(
      adapter,
      [
        { productId: product.id, quantity: product.stock },
        { productId: product.id, quantity: 1 },
      ],
      'guest',
    ),
  ).rejects.toThrow('quantity');
  await expect(
    quoteCart(adapter, [{ productId: 'missing', quantity: 1 }], 'guest'),
  ).rejects.toThrow('not found');
  const quote = await quoteCart(
    adapter,
    [
      { productId: product.id, quantity: 1 },
      { productId: product.id, quantity: 1 },
    ],
    'guest',
  );
  expect(quote.itemsTotal).toBe(2 * product.price);
  expect(quote.lines).toHaveLength(1);
});
import { cartHandler } from '@/server/cart/http';
it('quote and checkout share totals, reject changed totals, and leave catalog stock unchanged', async () => {
  const adapter = new InMemoryAdapter();
  const lines = [{ productId: 'prod-kidzone-lite-backpack', quantity: 1 }];
  const req = (body: unknown) =>
    new Request('http://localhost/api/checkout', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
  const quote = await (await cartHandler(() => adapter)(req({ lines }))).json();
  const original = (await adapter.getProduct(lines[0].productId))!.stock;
  expect(
    (
      await cartHandler(
        () => adapter,
        true,
      )(req({ lines, expectedTotal: quote.grandTotal + 1 }))
    ).status,
  ).toBe(409);
  const receipt = await (
    await cartHandler(
      () => adapter,
      true,
    )(req({ lines, expectedTotal: quote.grandTotal }))
  ).json();
  expect(receipt.grandTotal).toBe(quote.grandTotal);
  expect(receipt.orderId).toBeTruthy();
  expect((await adapter.getProduct(lines[0].productId))!.stock).toBe(original);
});
