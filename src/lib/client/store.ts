import type { Product, Shop } from '@/contract/types';
export type CartLine = { product: Product; shop: Shop; quantity: number };
export const money = (value: number) =>
  new Intl.NumberFormat('vi-VN').format(value) + '₫';
export function cartSummary(lines: CartLine[]) {
  const groups = [...new Set(lines.map((l) => l.shop.id))].map((id) => {
    const items = lines.filter((l) => l.shop.id === id);
    return {
      shop: items[0].shop,
      lines: items,
      subtotal: items.reduce((sum, l) => sum + l.product.price * l.quantity, 0),
    };
  });
  const itemsTotal = groups.reduce((sum, g) => sum + g.subtotal, 0);
  const shipping = groups.reduce((sum, g) => sum + g.shop.shipFee, 0);
  return { groups, itemsTotal, shipping, grandTotal: itemsTotal + shipping };
}
export function arrivalDate(today: string, days: number) {
  const date = new Date(today + 'T00:00:00Z');
  date.setUTCDate(date.getUTCDate() + days);
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(date);
}
export async function getJSON<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, init);
  if (!response.ok)
    throw new Error(
      response.status === 404
        ? 'Product not found.'
        : 'Unable to complete request. Please try again.',
    );
  return response.json();
}
