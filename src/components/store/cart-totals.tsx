import { cartSummary, money, type CartLine } from '@/lib/client/store';
export function CartTotals({ lines }: { lines: CartLine[] }) {
  const summary = cartSummary(lines);
  return (
    <dl className="space-y-3 rounded-2xl border bg-white p-6">
      <div className="flex justify-between gap-6">
        <dt>Items</dt>
        <dd>{money(summary.itemsTotal)}</dd>
      </div>
      <div className="flex justify-between gap-6">
        <dt>Shipping</dt>
        <dd>{money(summary.shipping)}</dd>
      </div>
      <div className="flex justify-between gap-6 border-t pt-3 text-lg font-bold">
        <dt>Total</dt>
        <dd>{money(summary.grandTotal)}</dd>
      </div>
    </dl>
  );
}
