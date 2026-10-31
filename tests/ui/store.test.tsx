import { afterEach, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import productFixtures from '@/contract/fixtures/products.json';
import { productSchema } from '@/contract/schemas';
const products = productSchema.array().parse(productFixtures);
import shops from '@/contract/fixtures/shops.json';
import { ProductCard } from '@/components/store/product-card';
import { CartTotals } from '@/components/store/cart-totals';
import { cartSummary, arrivalDate } from '@/lib/client/store';
afterEach(cleanup);
it('shows listing, tier and voucher badges with product evidence', () => {
  render(
    <ProductCard
      product={{ ...products[0], updatedForDemandAt: '2026-09-02T00:00:00Z' }}
      shop={{ ...shops[0], tier: 'mall' }}
      hasVoucher
    />,
  );
  expect(screen.getByText('Updated for this need')).toBeTruthy();
  expect(screen.getByText('Mall')).toBeTruthy();
  expect(screen.getByText('Shop voucher')).toBeTruthy();
  expect(screen.getByText('349.000₫')).toBeTruthy();
});
it('omits absent badges', () => {
  render(
    <ProductCard
      product={products[0]}
      shop={{ ...shops[0], tier: 'regular' }}
    />,
  );
  expect(screen.queryByText('Shop voucher')).toBeNull();
  expect(screen.queryByText('Updated for this need')).toBeNull();
});
it('groups quantities and charges shipping once per shop', () => {
  const lines = [
    {
      product: products[0],
      shop: { ...shops[0], tier: 'regular' as const },
      quantity: 2,
    },
    {
      product: products[1],
      shop: { ...shops[1], tier: 'mall' as const },
      quantity: 1,
    },
  ];
  const summary = cartSummary(lines);
  expect(summary.shipping).toBe(shops[0].shipFee + shops[1].shipFee);
  expect(summary.itemsTotal).toBe(349000 * 2 + 520000);
  render(<CartTotals lines={lines} />);
  expect(
    screen.getByText(
      new Intl.NumberFormat('vi-VN').format(summary.grandTotal) + '₫',
    ),
  ).toBeTruthy();
  expect(cartSummary([...lines, { ...lines[0], quantity: 1 }]).shipping).toBe(
    summary.shipping,
  );
});
it('uses the supplied demo date across month boundaries', () => {
  expect(arrivalDate('2026-09-30', 2)).toBe('Oct 2, 2026');
});
it('exposes search modes and buyer navigation', async () => {
  const { StoreHeader } = await import('@/components/store/header');
  const { CartProvider } = await import('@/components/store/cart-context');
  render(
    <CartProvider>
      <StoreHeader />
    </CartProvider>,
  );
  expect(screen.getByText('Search products')).toBeTruthy();
  expect(screen.getByText('Describe your need')).toBeTruthy();
  expect(screen.getByText('Seller Centre').getAttribute('href')).toBe(
    '/seller',
  );
});
