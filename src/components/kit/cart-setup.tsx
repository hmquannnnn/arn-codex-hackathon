'use client';
import type { CartLine } from '@/lib/client/store';
export function CartKitSetup({
  lines,
  source,
  keepProductIds,
  onSource,
  onKeep,
  fixedSource = false,
}: {
  lines: CartLine[];
  fixedSource?: boolean;
  source: 'catalog' | 'cart_only';
  keepProductIds: string[];
  onSource: (source: 'catalog' | 'cart_only') => void;
  onKeep: (ids: string[]) => void;
}) {
  return (
    <section className="m-4 space-y-3 rounded-xl border bg-orange-50 p-4 text-sm">
      {fixedSource ? (
        <p className="font-semibold">Only products already in your cart</p>
      ) : (
        <label className="block">
          Choose products from
          <select
            aria-label="Choose products from"
            className="ml-2 rounded border bg-white p-2"
            value={source}
            onChange={(e) => onSource(e.target.value as typeof source)}
          >
            <option value="catalog">Store and my cart</option>
            <option value="cart_only">Only my cart</option>
          </select>
        </label>
      )}
      <p className="text-xs text-slate-600">
        Recommendations leave your cart unchanged until you confirm. Items you
        do not choose stay saved.
      </p>
      {source === 'cart_only' && !lines.length && (
        <p>
          Your cart is empty. Save products in the store before building a kit.
        </p>
      )}
      {!!lines.length && (
        <details>
          <summary className="cursor-pointer">
            Saved products · {lines.length} · choose items to keep
          </summary>
          {lines.map((line) => (
            <label
              key={line.product.id}
              className="mt-2 flex items-center gap-2"
            >
              <input
                type="checkbox"
                aria-label={`Keep ${line.product.title}`}
                checked={keepProductIds.includes(line.product.id)}
                onChange={(e) =>
                  onKeep(
                    e.target.checked
                      ? [...keepProductIds, line.product.id]
                      : keepProductIds.filter((id) => id !== line.product.id),
                  )
                }
              />
              {line.product.title} · Qty {line.quantity}
            </label>
          ))}
        </details>
      )}
    </section>
  );
}
