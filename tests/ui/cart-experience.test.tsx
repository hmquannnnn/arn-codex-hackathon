import { afterEach, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { KitPanel } from '@/components/kit/panel';
import { CartKitIntro } from '@/components/kit/cart-intro';
import { confirmKit, kitThreadPath } from '@/lib/client/cart-flow';
import { threadResponseSchema } from '@/contract/schemas';
import threads from '@/contract/fixtures/threads.sample.json';
const version = threadResponseSchema.parse(threads[0]).versions[0];
const selected = version.options.find((o) => o.profile === 'balanced')!;
const lines = selected.lines;
const shopping = {
  source: 'cart_only' as const,
  cart: lines.map((l) => ({ productId: l.product.id, quantity: l.quantity })),
  keepProductIds: [],
};
afterEach(cleanup);
it('cart confirmation applies purchase quantities without modifying saved lines; catalog merges missing items', () => {
  const before = lines.map((l) => ({ ...l, quantity: l.quantity + 2 }));
  const result = confirmKit(before, lines, shopping);
  expect(result.cart).toBe(before);
  expect(result.purchases).toEqual(
    lines.map((l) => ({ productId: l.product.id, quantity: l.quantity })),
  );
  expect(
    confirmKit([], lines, { ...shopping, source: 'catalog' }).cart,
  ).toHaveLength(lines.length);
  expect(() => confirmKit([], lines, shopping)).toThrow(/changed/);
  expect(() => confirmKit(before, lines, { ...shopping, cart: [] })).toThrow(
    /saved/,
  );
});
it('cart threads keep their dedicated URL', () => {
  expect(kitThreadPath('abc', 'cart_only')).toBe('/cart/kit/t/abc');
  expect(kitThreadPath('abc', 'catalog')).toBe('/kit/t/abc');
});
it('cart introduction has fixed sourcing, cancel and a clear empty-cart state', () => {
  render(<CartKitIntro lines={[]} keepProductIds={[]} onKeep={() => {}} />);
  expect(
    screen.getByRole('heading', { name: 'Build from your cart' }),
  ).toBeTruthy();
  expect(screen.queryByLabelText('Choose products from')).toBeNull();
  expect(screen.getByText(/Your cart is empty/)).toBeTruthy();
  expect(
    screen.getByRole('link', { name: 'Back to cart' }).getAttribute('href'),
  ).toBe('/cart');
});
it('cart results use purchase language and keep saved leftovers visible', () => {
  const v = { ...version, plan: { ...version.plan, shopping } };
  render(
    <KitPanel
      version={v}
      versions={[v]}
      cartLines={lines.map((l) => ({ ...l, quantity: l.quantity + 1 }))}
      onVersion={() => {}}
      onRestore={() => {}}
      onSwap={async () => {}}
      onAdd={() => {}}
    />,
  );
  expect(
    screen.getByRole('button', { name: 'Use selected items' }),
  ).toBeTruthy();
  expect(screen.queryByRole('button', { name: /Add kit to cart/ })).toBeNull();
  expect(screen.getByRole('region', { name: 'Saved for later' })).toBeTruthy();
});
