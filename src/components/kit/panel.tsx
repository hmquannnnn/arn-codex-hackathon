'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import type {
  AdjustChange,
  BasketOption,
  KitSelection,
  KitVersion,
  Profile,
} from '@/contract/types';
import { money } from '@/lib/client/store';
import { noMatchText } from '@/lib/client/kit-text';
import { mergeOptions, compareToBalanced } from '@/lib/client/kit-compare';
import {
  applyFit,
  pickProduct,
  selectionFor,
} from '@/lib/client/kit-selection';
import { InlineEdit } from './inline-edit';
import { BudgetWarning } from './budget-warning';
import { NotifyButton } from './notify-button';
import { InterestCard } from './interest-card';
import { BasketRows } from './basket-rows';
const meanings = {
  saver: 'lowest total',
  balanced: 'best value',
  premium: 'top-rated within budget',
};
export function KitPanel({
  version,
  versions,
  onVersion,
  onProfileChange,
  onRestore,
  onSwap,
  onAdd,
  onSelect,
  onRemove,
  onAdjust,
  onUndoPrice,
  canUndoPrice,
  deliveryAddress,
  guest = false,
  busy = false,
}: {
  version?: KitVersion;
  versions: KitVersion[];
  onVersion: (n: number) => void;
  onProfileChange?: (profile: Profile) => void;
  onRestore: (n: number) => void;
  onSwap: (
    profile: Profile,
    key: string,
    id: string,
  ) => Promise<BasketOption | void>;
  onAdd: (option: BasketOption) => void;
  deliveryAddress?: string;
  guest?: boolean;
  busy?: boolean;
  onSelect?: (selection: KitSelection) => Promise<BasketOption | void>;
  onRemove?: (key: string) => void;
  onAdjust?: (change: AdjustChange) => Promise<void>;
  onUndoPrice?: () => Promise<BasketOption | void>;
  canUndoPrice?: boolean;
}) {
  const [profile, setProfile] = useState<Profile>('balanced');
  const [repriced, setRepriced] = useState<BasketOption>();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => {
    const profile = version?.selection?.profile ?? 'balanced';
    setProfile(profile);
    onProfileChange?.(profile);
    setRepriced(undefined);
    setError('');
  }, [version?.version, version?.selection?.profile, onProfileChange]);
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
    options.find((o) => o.profiles.includes(profile)) ||
    options.find((o) => o.profile === 'balanced') ||
    options[0];
  const option =
    repriced && selected?.profiles.includes(repriced.profile)
      ? repriced
      : selected;
  const gapKey = (key: string) => {
    const item = version.plan.items.find((i) => i.key === key);
    return `${item?.category ?? 'none'}|${[...(item?.mustHaveTags || [])].sort().join(',')}`;
  };
  const older =
    version.version !==
    Math.max(...versions.map((v) => v.version), version.version);
  async function reprice(action: () => Promise<BasketOption | void>) {
    if (busy || pending || older) return;
    setPending(true);
    setError('');
    try {
      const result = await action();
      if (result) {
        setRepriced(result);
        setProfile(result.profile);
        onProfileChange?.(result.profile);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unable to update basket');
    } finally {
      setPending(false);
    }
  }
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
          {onAdjust ? (
            <InlineEdit
              label="budget"
              type="number"
              value={String(version.plan.budget ?? '')}
              display={
                <>
                  Budget{' '}
                  {version.plan.budget === null
                    ? 'No limit'
                    : money(version.plan.budget)}
                </>
              }
              disabled={older || busy || pending}
              onSave={(value) =>
                onAdjust({
                  type: 'set_budget',
                  budget: value === '' ? null : Number(value),
                })
              }
            />
          ) : (
            <span>
              Budget{' '}
              {version.plan.budget === null
                ? 'No limit'
                : money(version.plan.budget)}
            </span>
          )}
          {onAdjust ? (
            <InlineEdit
              label="deadline"
              type="date"
              value={version.plan.deadline || ''}
              display={
                version.plan.deadline
                  ? `By ${new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' }).format(new Date(version.plan.deadline + 'T00:00:00Z'))}`
                  : 'No deadline'
              }
              disabled={older || busy || pending}
              onSave={(value) =>
                onAdjust({ type: 'set_deadline', deadline: value || null })
              }
            />
          ) : (
            version.plan.deadline && (
              <span>
                By{' '}
                {new Intl.DateTimeFormat('en-US', {
                  month: 'short',
                  day: 'numeric',
                  timeZone: 'UTC',
                }).format(new Date(version.plan.deadline + 'T00:00:00Z'))}
              </span>
            )
          )}
        </div>
        {deliveryAddress && (
          <p className="mt-2 text-xs text-slate-500">
            Deliver to {deliveryAddress}
          </p>
        )}
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
          {version.options.some((o) => o.lines.length > 0) && (
            <div
              role="tablist"
              aria-label="Basket profiles"
              className="grid gap-2"
              style={{
                gridTemplateColumns: `repeat(${options.length}, minmax(0, 1fr))`,
              }}
            >
              {options.map((o) => (
                <button
                  key={o.profile}
                  role="tab"
                  aria-selected={selected.profile === o.profile}
                  disabled={busy || pending}
                  onClick={() => {
                    setProfile(o.profile);
                    onProfileChange?.(o.profile);
                    setRepriced(undefined);
                    setError('');
                  }}
                  className={`rounded-xl border p-2 text-left ${selected.profile === o.profile ? 'border-accent bg-orange-50' : 'bg-white'}`}
                >
                  <span className="block text-xs font-bold capitalize">
                    {o.status === 'over_budget' ? '⚠ ' : ''}
                    {o.label}
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
          )}
          {version.options.some((o) => o.lines.length > 0) && (
            <p
              data-testid="basket-difference"
              className="text-xs leading-5 text-slate-600"
            >
              {compareToBalanced(
                option,
                version.options.find((o) => o.profile === 'balanced'),
                version.plan.items,
              )}
            </p>
          )}
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
                  {!guest &&
                    option.interests
                      ?.filter(
                        (interest) =>
                          interest.itemKey === g.itemKey &&
                          !option.lines.some(
                            (line) =>
                              line.itemKey === interest.itemKey &&
                              line.product.id === interest.candidate.product.id,
                          ),
                      )
                      .map((interest) => (
                        <InterestCard
                          key={interest.itemKey}
                          interest={interest}
                          limit={
                            version.plan.items.find(
                              (item) => item.key === interest.itemKey,
                            )?.maxUnitPrice
                          }
                          disabled={older || busy || pending}
                          onSwitch={
                            onSelect
                              ? () =>
                                  void reprice(() =>
                                    onSelect(
                                      pickProduct(
                                        selectionFor(version, option.profile),
                                        interest.itemKey,
                                        interest.candidate.product.id,
                                      ),
                                    ),
                                  )
                              : undefined
                          }
                        />
                      ))}
                  <button
                    disabled={older || busy || pending || !onSelect}
                    onClick={() =>
                      void reprice(() =>
                        onSelect!(
                          pickProduct(
                            selectionFor(version, option.profile),
                            g.itemKey,
                            g.closest!.candidate.product.id,
                          ),
                        ),
                      )
                    }
                    className="mt-3 rounded-lg border border-amber-300 bg-white px-3 py-2 text-xs font-semibold disabled:opacity-40"
                  >
                    Add anyway
                  </button>
                  <div>
                    <NotifyButton
                      key={gapKey(g.itemKey)}
                      gapKey={gapKey(g.itemKey)}
                    />
                  </div>
                  {!!g.closest!.overMaxPriceBy && (
                    <p className="mt-1 text-xs">
                      Over your max price by {money(g.closest!.overMaxPriceBy)}
                    </p>
                  )}
                </div>
              ))}
          </section>
          <BasketRows
            option={option}
            version={version}
            disabled={older || busy || pending}
            interests={guest ? [] : option.interests}
            onInterest={
              onSelect
                ? (interest) =>
                    void reprice(() =>
                      onSelect(
                        pickProduct(
                          selectionFor(version, option.profile),
                          interest.itemKey,
                          interest.candidate.product.id,
                        ),
                      ),
                    )
                : undefined
            }
            onRemove={onRemove}
            onSwap={(key, id) =>
              void reprice(() => onSwap(option.profile, key, id))
            }
          />
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
                    <li key={g.itemKey}>
                      {g.needLabel}
                      <div>
                        <NotifyButton
                          key={gapKey(g.itemKey)}
                          gapKey={gapKey(g.itemKey)}
                        />
                      </div>
                    </li>
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
          <BudgetWarning
            option={option}
            budget={version.plan.budget}
            disabled={older || busy || pending}
            onFit={
              onSelect
                ? (fit) =>
                    void reprice(() =>
                      onSelect(
                        applyFit(selectionFor(version, option.profile), fit),
                      ),
                    )
                : undefined
            }
          />
          {canUndoPrice && onUndoPrice && (
            <button
              disabled={older || busy || pending}
              onClick={() => void reprice(onUndoPrice)}
              className="text-xs text-accent underline"
            >
              Undo last basket edit
            </button>
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
            <div data-testid="savings" className="space-y-2">
              {[...option.savings]
                .filter((s) => !guest || !s.wallet)
                .sort((a, b) => Number(!!b.wallet) - Number(!!a.wallet))
                .map((s, i) => (
                  <p key={i} className="text-xs text-emerald-700">
                    {s.wallet ? '🎟 ' : ''}
                    {s.label} · save {money(s.amount)}
                  </p>
                ))}
            </div>
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
            {option.status === 'over_budget'
              ? `Add kit to cart (over budget by ${money(option.overBy ?? Math.max(0, option.grandTotal - (version.plan.budget ?? option.grandTotal)))})`
              : 'Add kit to cart'}
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
