'use client';
import Link from 'next/link';
import type { BasketOption, KitVersion } from '@/contract/types';
import { money } from '@/lib/client/store';
export function BasketRows({
  option,
  version,
  disabled,
  onRemove,
  onSwap,
}: {
  option: BasketOption;
  version: KitVersion;
  disabled: boolean;
  onRemove?: (key: string) => void;
  onSwap: (key: string, id: string) => void;
}) {
  return (
    <section
      data-testid="basket"
      aria-label="Basket"
      className="divide-y rounded-xl border bg-white"
    >
      <h2 className="px-4 py-3 text-sm font-bold">
        Basket · {option.lines.length} items
      </h2>
      {option.lines.map((line) => (
        <div key={line.itemKey} className="p-4">
          <div className="flex justify-between gap-3">
            <Link
              href={`/products/${line.product.id}`}
              className="text-sm font-semibold hover:text-accent"
            >
              {line.product.title}
            </Link>
            <div className="flex shrink-0 items-center gap-2">
              <span className="text-sm font-bold">{money(line.lineTotal)}</span>
              <button
                aria-label={`Remove ${line.product.title}`}
                title="I already have this"
                disabled={disabled || !onRemove}
                onClick={() => onRemove?.(line.itemKey)}
                className="rounded px-2 py-1 text-slate-400 hover:bg-red-50 hover:text-red-700 disabled:opacity-40"
              >
                ✕
              </button>
            </div>
          </div>
          <p className="mt-1 text-xs text-slate-500">
            {line.shop.name} · Qty {line.quantity}
          </p>
          {line.product.updatedForDemandAt && (
            <p className="mt-1 text-xs text-emerald-700">
              Updated for this need
            </p>
          )}
          <p className="mt-2 text-xs leading-5 text-slate-600">
            {version.selection?.picks[line.itemKey] === line.product.id &&
            version.plan.items
              .find((item) => item.key === line.itemKey)
              ?.mustHaveTags.some((tag) => !line.product.tags.includes(tag))
              ? `Closest match · missing ${version.plan.items
                  .find((item) => item.key === line.itemKey)!
                  .mustHaveTags.filter(
                    (tag) => !line.product.tags.includes(tag),
                  )
                  .join(', ')}`
              : line.reason}
          </p>
          {line.alternatives.length > 0 && (
            <details className="mt-3 text-xs">
              <summary className="cursor-pointer text-accent">
                {line.alternatives.length} alternatives
              </summary>
              {line.alternatives.map((a) => (
                <div
                  key={a.product.id}
                  className="mt-3 rounded-lg bg-slate-50 p-3"
                >
                  <p>
                    {a.product.title} · {money(a.product.price)}
                  </p>
                  <p className="mt-1 text-slate-500">
                    {a.shop.name} · ★ {a.product.rating}
                  </p>
                  <button
                    disabled={disabled}
                    onClick={() => onSwap(line.itemKey, a.product.id)}
                    className="mt-2 rounded-lg border px-3 py-2 font-semibold disabled:opacity-40"
                  >
                    Swap
                  </button>
                </div>
              ))}
            </details>
          )}
        </div>
      ))}
    </section>
  );
}
