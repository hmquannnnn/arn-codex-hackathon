'use client';
import type { Gap, InsightsResponse } from '@/contract/types';
import { categories } from '@/contract/taxonomy';
import { money } from '@/lib/client/store';
export function LiveStrip({ recent }: { recent: InsightsResponse['recent'] }) {
  return (
    <section className="rounded-2xl border bg-white p-5">
      <h2 className="font-semibold">Just searched (live)</h2>
      {!recent.length ? (
        <p className="mt-3 text-sm text-slate-500">
          No live searches yet — try Kitly
        </p>
      ) : (
        <ul className="mt-3 flex flex-wrap gap-2">
          {[...recent]
            .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
            .map((item, i) => (
              <li
                key={`${item.createdAt}-${i}`}
                data-testid="recent-need"
                className={`rounded-xl px-3 py-2 text-xs ${categories.find((c) => c.event === item.event)?.color || 'bg-slate-100 text-slate-600'}`}
              >
                <p className="font-semibold">{item.needLabel}</p>
                <p className="mt-1">
                  {relativeTime(item.createdAt)}
                  {item.category === null && (
                    <>
                      {' '}
                      · <span>Not in catalog</span>
                    </>
                  )}
                </p>
              </li>
            ))}
        </ul>
      )}
    </section>
  );
}
function relativeTime(date: string) {
  const minutes = Math.max(
    0,
    Math.floor((Date.now() - Date.parse(date)) / 60000),
  );
  return minutes < 1
    ? 'Just now'
    : minutes < 60
      ? `${minutes} min ago`
      : minutes < 1440
        ? `${Math.floor(minutes / 60)} h ago`
        : `${Math.floor(minutes / 1440)} days ago`;
}
export function GapCard({
  gap,
  busy,
  onPreview,
  onUndo,
}: {
  gap: Gap;
  busy: boolean;
  onPreview: (productId: string, gapKey: string) => void;
  onUndo: (productId: string) => void;
}) {
  const listing = gap.type === 'listing_gap';
  const count = gap.candidates?.length || 0;
  const trend = gap.lastWeek
    ? Math.round(((gap.thisWeek - gap.lastWeek) / gap.lastWeek) * 100)
    : null;
  return (
    <article data-testid="gap-card" className="rounded-2xl border bg-white p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <span
          className={`rounded-full px-3 py-1 text-xs font-semibold ${listing ? 'bg-blue-50 text-blue-700' : 'bg-amber-50 text-amber-700'}`}
        >
          {listing ? 'Listing gap' : 'Assortment gap'}
        </span>
        <span className="text-xs text-slate-500">
          {trend === null
            ? 'New demand'
            : `${trend >= 0 ? '▲' : '▼'} ${Math.abs(trend)}%`}
        </span>
      </div>
      <h2 className="mt-4 text-lg font-bold">{gap.needLabel}</h2>
      <p className="mt-3 text-sm">
        <strong>{gap.thisWeek}</strong> this week · {gap.lastWeek} last week
      </p>
      <p className="mt-2 text-sm text-slate-600">
        {gap.priceBand
          ? `${money(gap.priceBand.p25)}–${money(gap.priceBand.p75)}`
          : 'No price band yet'}
      </p>
      <p className="mt-2 text-xs text-slate-500">
        {listing
          ? `${count} ${count === 1 ? 'listing could match if its tags were fixed' : 'listings could match if their tags were fixed'}`
          : '0 shops selling'}
      </p>
      <p className="mt-2 text-xs text-slate-500">
        {gap.matchingProducts} exact matching products
      </p>
      <p className="mt-4 rounded-xl bg-slate-50 p-3 text-sm leading-6">
        {gap.advice}
      </p>
      {!!gap.neededWith.length && (
        <div className="mt-3 flex flex-wrap items-center gap-2 text-xs">
          <span className="text-slate-500">Needed with</span>
          {gap.neededWith.map((n) => (
            <span
              key={n.category}
              className="rounded-full bg-slate-100 px-2 py-1"
            >
              {categories.find((c) => c.id === n.category)?.label || n.category}{' '}
              · {Math.round(n.share * 100)}%
            </span>
          ))}
        </div>
      )}
      {!listing && (
        <p className="mt-3 text-xs text-slate-500">
          {gap.watchers || 0} buyers waiting
        </p>
      )}
      {listing && gap.appliedFix ? (
        <div className="mt-4 flex items-center gap-3 text-sm">
          <span className="font-semibold text-emerald-700">Fixed</span>
          <button
            disabled={busy}
            onClick={() => onUndo(gap.appliedFix!.productId)}
            className="text-accent underline disabled:opacity-40"
          >
            Undo
          </button>
        </div>
      ) : (
        listing &&
        gap.candidates?.map((candidate) => (
          <div key={candidate.productId} className="mt-4 border-t pt-4">
            <p className="text-sm font-semibold">{candidate.title}</p>
            <blockquote className="mt-2 border-l-2 border-orange-200 pl-3 text-xs leading-5 text-slate-500">
              “{candidate.evidence}”
            </blockquote>
            <button
              disabled={busy}
              onClick={() => onPreview(candidate.productId, gap.key)}
              className="mt-3 rounded-xl bg-accent px-4 py-2 text-sm font-semibold text-white disabled:opacity-40"
            >
              Preview fix
            </button>
          </div>
        ))
      )}
    </article>
  );
}
