import type { BasketOption } from '@/contract/types';
import type { CartLine } from '@/lib/client/store';
import { kitPurchases } from '@/lib/client/cart-flow';
export function CartKitReview({
  lines,
  option,
}: {
  lines: CartLine[];
  option: BasketOption;
}) {
  const purchases = new Map(
    kitPurchases(option.lines).map((line) => [line.productId, line.quantity]),
  );
  const later = lines
    .map((line) => ({
      ...line,
      quantity: Math.max(
        0,
        line.quantity - (purchases.get(line.product.id) ?? 0),
      ),
    }))
    .filter((line) => line.quantity > 0);
  return (
    <section
      aria-label="Saved for later"
      className="rounded-xl border bg-white p-4 text-sm"
    >
      <h2 className="font-semibold">
        Saved for later · {later.length} products
      </h2>
      <p className="mt-1 text-xs text-slate-500">
        These products and quantities stay in your cart.
      </p>
      <ul className="mt-3 space-y-2">
        {later.map((line) => (
          <li key={line.product.id}>
            {line.product.title} · Qty {line.quantity}
          </li>
        ))}
      </ul>
      {!later.length && (
        <p className="mt-2 text-xs">
          All saved quantities are selected for this purchase.
        </p>
      )}
    </section>
  );
}
