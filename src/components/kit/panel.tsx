'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import type { BasketOption, KitVersion, Profile } from '@/contract/types';
import { money } from '@/lib/client/store';
import { noMatchText } from '@/lib/client/kit-text';
import { mergeOptions } from '@/lib/client/kit-compare';
const meanings = {
  saver: 'lowest total',
  balanced: 'best value',
  premium: 'top-rated within budget',
};
export function KitPanel({
  version,
  versions,
  onVersion,
  onRestore,
  onSwap,
  onAdd,
  busy = false,
}: {
  version?: KitVersion;
  versions: KitVersion[];
  onVersion: (n: number) => void;
  onRestore: (n: number) => void;
  onSwap: (
    profile: Profile,
    key: string,
    id: string,
  ) => Promise<BasketOption | void>;
  onAdd: (option: BasketOption) => void;
  busy?: boolean;
}) {
  const [profile, setProfile] = useState<Profile>('balanced');
  const [repriced, setRepriced] = useState<BasketOption>();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => {
    setProfile('balanced');
    setRepriced(undefined);
    setError('');
  }, [version?.version]);
  if (!version)
    return (
      <div className="flex h-full min-h-64 items-center justify-center p-8 text-center text-sm text-slate-400">
        Your kit will take shape here.
        <br />
        One need. Everything together.
      </div>
    );
  const options = mergeOptions(version.options);
  const selected =
    options.find((o) => o.profile === profile) ||
    options.find((o) => o.profile === 'balanced') ||
    options[0];
  const option = repriced?.profile === selected?.profile ? repriced : selected;
  const older =
    version.version !==
    Math.max(...versions.map((v) => v.version), version.version);
  return (
    <div className="space-y-5 p-5">
      <header>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="rounded-full bg-orange-50 px-3 py-1 text-xs font-semibold capitalize text-accent">
            {version.plan.event.replaceAll('_', ' ')}
          </span>
          <select
            aria-label="Kit version"
            value={version.version}
            disabled={busy || pending}
            onChange={(e) => onVersion(Number(e.target.value))}
            className="max-w-full rounded-lg border bg-white px-2 py-2 text-xs"
          >
            {versions.map((v) => (
              <option key={v.version} value={v.version}>
                Version {v.version} of{' '}
                {Math.max(...versions.map((v) => v.version))}
              </option>
            ))}
          </select>
        </div>
        <div className="mt-4 flex flex-wrap gap-x-4 gap-y-2 text-sm font-medium">
          <span>
            Budget{' '}
            {version.plan.budget === null
              ? 'No limit'
              : money(version.plan.budget)}
          </span>
          {version.plan.deadline && (
            <span>
              By{' '}
              {new Intl.DateTimeFormat('en-US', {
                month: 'short',
                day: 'numeric',
                timeZone: 'UTC',
              }).format(new Date(version.plan.deadline + 'T00:00:00Z'))}
            </span>
          )}
        </div>
        {older && (
          <div className="mt-3 rounded-xl bg-amber-50 p-3 text-xs">
            Viewing an earlier version · read-only
            <button
              disabled={busy}
              onClick={() => onRestore(version.version)}
              className="mt-2 block font-semibold text-accent underline"
            >
              Restore this version
            </button>
          </div>
        )}
      </header>
      {version.status === 'awaiting_budget' ? (
        <p className="rounded-xl bg-orange-50 p-6 text-sm">
          Waiting for your budget
        </p>
      ) : !option ? (
        <p role="status" className="text-sm text-slate-500">
          Comparing products and building your kit…
        </p>
      ) : (
        <>
          <div
            role="tablist"
            aria-label="Basket profiles"
            className="grid grid-cols-3 gap-2"
          >
            {options.map((o) => (
              <button
                key={o.profile}
                role="tab"
                aria-selected={option.profile === o.profile}
                disabled={pending}
                onClick={() => {
                  setProfile(o.profile);
                  setRepriced(undefined);
                  setError('');
                }}
                className={`rounded-xl border p-2 text-left ${option.profile === o.profile ? 'border-accent bg-orange-50' : 'bg-white'}`}
              >
                <span className="block text-xs font-bold capitalize">
                  {o.status === 'over_budget' ? '⚠ ' : ''}
                  {o.profile[0].toUpperCase() + o.profile.slice(1)}
                </span>
                <span className="mt-1 block text-sm font-semibold">
                  {money(o.grandTotal)}
                </span>
                <span className="mt-1 block text-[10px] text-slate-500">
                  {meanings[o.profile]}
                </span>
              </button>
            ))}
          </div>
          <section
            data-testid="no-match"
            aria-label="No exact match"
            className="space-y-3"
          >
            {option.noMatch
              .filter((g) => g.closest)
              .map((g) => (
                <div
                  key={g.itemKey}
                  className="rounded-xl border border-amber-200 bg-amber-50 p-4"
                >
                  <h3 className="text-sm font-semibold">
                    {noMatchText(version.plan, g)}
                  </h3>
                  <p className="mt-2 text-sm">
                    Closest:{' '}
                    <Link
                      href={`/products/${g.closest!.candidate.product.id}`}
                      className="underline"
                    >
                      {g.closest!.candidate.product.title}
                    </Link>{' '}
                    · {money(g.closest!.candidate.product.price)}
                  </p>
                  <p className="mt-2 text-xs text-amber-800">
                    Missing:{' '}
                    {g.closest!.missingTags.join(', ') || 'No missing tags'}
                  </p>
                  {!!g.closest!.overMaxPriceBy && (
                    <p className="mt-1 text-xs">
                      Over your max price by {money(g.closest!.overMaxPriceBy)}
                    </p>
                  )}
                </div>
              ))}
          </section>
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
                  <span className="shrink-0 text-sm font-bold">
                    {money(line.lineTotal)}
                  </span>
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
                  {line.reason}
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
                          disabled={older || busy || pending}
                          onClick={async () => {
                            setPending(true);
                            setError('');
                            try {
                              const result = await onSwap(
                                option.profile,
                                line.itemKey,
                                a.product.id,
                              );
                              if (result) setRepriced(result);
                            } catch (e) {
                              setError(
                                e instanceof Error ? e.message : 'Swap failed',
                              );
                            } finally {
                              setPending(false);
                            }
                          }}
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
          {option.noMatch.some((g) => !g.closest) && (
            <details className="rounded-xl border bg-slate-50 p-4">
              <summary className="cursor-pointer text-sm font-semibold">
                Not in store yet (
                {option.noMatch.filter((g) => !g.closest).length})
              </summary>
              <ul className="mt-3 space-y-2 text-sm">
                {option.noMatch
                  .filter((g) => !g.closest)
                  .map((g) => (
                    <li key={g.itemKey}>{g.needLabel}</li>
                  ))}
              </ul>
            </details>
          )}
          {!!option.skipped.length && (
            <section className="text-xs text-slate-500">
              <h2 className="font-semibold">Skipped for budget</h2>
              {option.skipped.map((s) => (
                <p key={s.itemKey} className="mt-1">
                  {s.needLabel}
                </p>
              ))}
            </section>
          )}
          {option.status === 'over_budget' && (
            <div role="alert" className="rounded-xl bg-amber-50 p-4 text-sm">
              <p className="font-semibold">This kit exceeds your budget</p>
              <p className="mt-2">
                Minimum cost: {money(option.minimumCost ?? option.grandTotal)}
              </p>
              {option.costDrivers?.map((d) => (
                <p key={d} className="mt-1 text-xs">
                  {d}
                </p>
              ))}
            </div>
          )}
          <section className="space-y-3 rounded-xl bg-slate-50 p-4 text-sm">
            <h2 className="font-bold">Your kit total</h2>
            <Row label="Items" value={option.itemsTotal} />
            <Row label="Shipping" value={option.shippingTotal} />
            <Row label="Discounts" value={-option.discountTotal} />
            <div className="border-t pt-3 font-bold">
              <Row label="Total" value={option.grandTotal} />
            </div>
            {version.plan.budget !== null && (
              <>
                <progress
                  aria-label="Budget used"
                  max={Math.max(1, version.plan.budget)}
                  value={Math.min(
                    option.grandTotal,
                    Math.max(1, version.plan.budget),
                  )}
                  className="h-2 w-full accent-orange-500"
                />
                <p className="text-xs text-slate-500">
                  {money(option.grandTotal)} of {money(version.plan.budget)}
                </p>
              </>
            )}
            {option.savings.map((s, i) => (
              <p key={i} className="text-xs text-emerald-700">
                {s.label} · save {money(s.amount)}
              </p>
            ))}
          </section>
          {error && (
            <p role="alert" className="text-sm text-red-700">
              {error}
            </p>
          )}
          <button
            disabled={older || busy || pending || !option.lines.length}
            onClick={() => onAdd(option)}
            className="w-full rounded-xl bg-accent py-3 text-sm font-bold text-white disabled:opacity-40"
          >
            Add kit to cart
          </button>
        </>
      )}
    </div>
  );
}
function Row({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex justify-between gap-4">
      <span>{label}</span>
      <span>{money(value)}</span>
    </div>
  );
}
