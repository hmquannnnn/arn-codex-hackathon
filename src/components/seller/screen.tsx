'use client';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import type {
  EnrichmentPreviewResponse,
  InsightsResponse,
  Shop,
} from '@/contract/types';
import {
  HttpSellerApi,
  MockSellerApi,
  type SellerApi,
} from '@/lib/client/seller-api';
import { PersonaChip } from '@/components/persona-chip';
import { categories } from '@/contract/taxonomy';
import { GapCard, LiveStrip } from './gaps';
import { PreviewDrawer } from './preview';
export function SellerScreen({
  api: supplied,
  initialShop = 'all',
}: {
  api?: SellerApi;
  initialShop?: string;
}) {
  const api = useMemo(
    () =>
      supplied ||
      (process.env.NEXT_PUBLIC_KITLY_MOCK === '1'
        ? new MockSellerApi()
        : new HttpSellerApi()),
    [supplied],
  );
  const [shop, setShop] = useState(initialShop);
  const [shops, setShops] = useState<Shop[]>([]);
  const [data, setData] = useState<InsightsResponse>();
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [toast, setToast] = useState('');
  const [preview, setPreview] = useState<EnrichmentPreviewResponse>();
  const active = useRef(true);
  const request = useRef(0);
  const mutating = useRef(false);
  const invalidate = useCallback(() => {
    request.current++;
  }, []);
  const refresh = useCallback(async () => {
    const id = ++request.current;
    try {
      const result = await api.insights(shop);
      if (active.current && request.current === id) {
        setData(result);
        setError('');
      }
    } catch (e) {
      if (active.current && request.current === id)
        setError(e instanceof Error ? e.message : 'Could not load insights');
    } finally {
      if (active.current && request.current === id) setLoading(false);
    }
  }, [api, shop]);
  useEffect(() => {
    let mounted = true;
    api
      .shops()
      .then((result) => {
        if (mounted) setShops(result.shops);
      })
      .catch((e) => {
        if (mounted) setError(e.message);
      });
    return () => {
      mounted = false;
    };
  }, [api]);
  useEffect(() => {
    active.current = true;
    setLoading(true);
    setData(undefined);
    void refresh();
    const timer = setInterval(() => {
      if (document.visibilityState !== 'hidden' && !mutating.current)
        void refresh();
    }, 10000);
    return () => {
      active.current = false;
      invalidate();
      clearInterval(timer);
    };
  }, [refresh, invalidate]);
  async function operation(action: () => Promise<void>) {
    if (mutating.current) return;
    mutating.current = true;
    setBusy(true);
    setError('');
    try {
      await action();
    } catch (e) {
      if (active.current)
        setError(
          e instanceof Error
            ? e.message
            : 'The listing could not be updated. Try again.',
        );
    } finally {
      mutating.current = false;
      if (active.current) setBusy(false);
    }
  }
  const unmet = data?.gaps.reduce((n, g) => n + g.thisWeek, 0) || 0;
  const previous = data?.gaps.reduce((n, g) => n + g.lastWeek, 0) || 0;
  const searches = data?.topNeeds.reduce((n, t) => n + t.count, 0) || 0;
  return (
    <div className="min-h-dvh">
      <header className="border-b bg-white">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-3 px-5 py-4">
          <Link href="/" className="text-lg font-bold text-accent">
            DemoMart{' '}
            <span className="text-sm font-normal text-slate-500">
              Seller Centre
            </span>
          </Link>
          <PersonaChip />
        </div>
      </header>
      <main className="mx-auto max-w-7xl space-y-6 px-5 py-8">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-widest text-accent">
              Intent becomes opportunity
            </p>
            <h1 className="mt-2 text-3xl font-bold">Seller Intelligence</h1>
            <p className="mt-3 text-sm text-slate-500">
              See what buyers need. Help your listings meet them.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <select
              aria-label="Shop"
              disabled={busy}
              value={shop}
              onChange={(e) => {
                setShop(e.target.value);
                setPreview(undefined);
                setToast('');
                window.history.replaceState(
                  null,
                  '',
                  `/seller?shop=${encodeURIComponent(e.target.value)}`,
                );
              }}
              className="max-w-full rounded-xl border bg-white px-3 py-3 text-sm"
            >
              <option value="all">All shops</option>
              {shops.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
            <button
              disabled={busy || loading}
              onClick={() => {
                setLoading(true);
                void refresh();
              }}
              className="rounded-xl border bg-white px-4 py-3 text-sm disabled:opacity-40"
            >
              Refresh
            </button>
          </div>
        </div>
        {process.env.NEXT_PUBLIC_KITLY_MOCK === '1' && (
          <p className="text-xs text-amber-700">Fixture replay</p>
        )}
        {error && (
          <div
            role="alert"
            className="rounded-xl bg-red-50 p-4 text-sm text-red-800"
          >
            {error}
            <button
              disabled={busy}
              onClick={() => void refresh()}
              className="ml-3 underline"
            >
              Retry
            </button>
          </div>
        )}
        {toast && (
          <p
            role="status"
            className="rounded-xl bg-emerald-50 p-4 text-sm text-emerald-800"
          >
            {toast}
          </p>
        )}
        {loading && !data ? (
          <p role="status" className="rounded-2xl border bg-white p-8">
            Loading demand insights…
          </p>
        ) : (
          data && (
            <>
              <LiveStrip recent={data.recent} />
              <div className="grid gap-3 sm:grid-cols-3">
                {[
                  ['Unmet needs this week', unmet],
                  ['Total searches this week', searches],
                  [
                    'Trend vs last week',
                    previous
                      ? `${Math.round(((unmet - previous) / previous) * 100)}%`
                      : 'New demand',
                  ],
                ].map(([label, value]) => (
                  <div key={label} className="rounded-2xl border bg-white p-5">
                    <p className="text-xs text-slate-500">{label}</p>
                    <p className="mt-3 text-3xl font-bold">{value}</p>
                  </div>
                ))}
              </div>
              <section>
                <h2 className="mb-4 text-xl font-bold">
                  Opportunities from unmet needs
                </h2>
                {data.gaps.length ? (
                  <div className="grid items-start gap-5 lg:grid-cols-2">
                    {data.gaps.map((gap) => (
                      <GapCard
                        key={gap.key}
                        gap={gap}
                        busy={busy}
                        onPreview={(productId, gapKey) =>
                          void operation(async () => {
                            const proposal = await api.preview(
                              productId,
                              gapKey,
                            );
                            if (active.current) setPreview(proposal);
                          })
                        }
                        onUndo={(productId) =>
                          void operation(async () => {
                            await api.undo(productId);
                            setToast('Listing restored.');
                            await refresh();
                          })
                        }
                      />
                    ))}
                  </div>
                ) : (
                  <p className="rounded-2xl border bg-white p-8 text-sm text-slate-500">
                    No unmet needs found for this shop yet.
                  </p>
                )}
              </section>
              <div className="grid gap-5 md:grid-cols-2">
                <section className="rounded-2xl border bg-white p-5">
                  <h2 className="font-bold">Frequently needed together</h2>
                  {data.combos.length ? (
                    data.combos.map((combo, i) => (
                      <div key={i} className="mt-4 rounded-xl bg-slate-50 p-4">
                        <p className="text-sm">
                          {combo.categories
                            .map(
                              (id) =>
                                categories.find((c) => c.id === id)?.label ||
                                id,
                            )
                            .join(' + ')}
                        </p>
                        <p className="mt-2 text-xs text-slate-500">
                          {combo.count} searches together
                        </p>
                      </div>
                    ))
                  ) : (
                    <p className="mt-3 text-sm text-slate-500">
                      No combinations yet.
                    </p>
                  )}
                </section>
                <section className="rounded-2xl border bg-white p-5">
                  <h2 className="font-bold">Top needs by occasion</h2>
                  {data.topNeeds.map((need) => (
                    <div key={need.event} className="mt-4">
                      <p className="flex justify-between text-xs capitalize">
                        <span>{need.event.replaceAll('_', ' ')}</span>
                        <span>{need.count}</span>
                      </p>
                      <div className="mt-2 h-2 rounded-full bg-slate-100">
                        <div
                          className="h-full rounded-full bg-orange-300"
                          style={{
                            width: `${(need.count / Math.max(1, ...data.topNeeds.map((t) => t.count))) * 100}%`,
                          }}
                        />
                      </div>
                    </div>
                  ))}
                </section>
              </div>
            </>
          )
        )}
        {preview && (
          <PreviewDrawer
            preview={preview}
            busy={busy}
            error={error}
            onClose={() => setPreview(undefined)}
            onApply={() =>
              void operation(async () => {
                await api.apply(preview.proposalId);
                setPreview(undefined);
                setToast(
                  'Listing updated. Your original keywords are preserved.',
                );
                await refresh();
              })
            }
          />
        )}
      </main>
    </div>
  );
}
