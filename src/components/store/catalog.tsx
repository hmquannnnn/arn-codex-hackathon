'use client';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import type { ProductsResponse, ProductResponse } from '@/contract/types';
import { categories } from '@/contract/taxonomy';
import { getJSON } from '@/lib/client/store';
import { CategoryTile, ProductCard } from './product-card';
const events = [
  ['back_to_school', 'Back to school', 'A fresh start, all sorted.'],
  ['newborn', 'Hello, little one', 'Everyday essentials for a new arrival.'],
  [
    'first_apartment',
    'Make yourself at home',
    'Small touches. A place of your own.',
  ],
  ['camping_trip', 'Out of office', 'Get ready for your next adventure.'],
  ['home_office', 'Work your way', 'Build a space that works for you.'],
  [
    'tet_gifts',
    'Thoughtful gifts',
    'Something special for your favourite people.',
  ],
];
export function Catalog({
  query = '',
  category = '',
  home = false,
}: {
  query?: string;
  category?: string;
  home?: boolean;
}) {
  const [data, setData] = useState<ProductsResponse | null>(null);
  const [vouchers, setVouchers] = useState<Set<string>>(new Set());
  const [error, setError] = useState('');
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    let active = true;
    setData(null);
    setError('');
    const params = new URLSearchParams({
      limit: '200',
      ...(query ? { q: query } : {}),
      ...(category ? { category } : {}),
    });
    (home
      ? Promise.all(
          events.map(([event]) => {
            const category = categories.find((c) => c.event === event)!;
            return getJSON<ProductsResponse>(
              `/api/products?${new URLSearchParams({ category: category.id, limit: '5' })}`,
            );
          }),
        ).then((results) => ({
          products: results.flatMap((result) => result.products),
        }))
      : getJSON<ProductsResponse>(`/api/products?${params}`)
    )
      .then(async (result) => {
        if (!active) return;
        setData(result);
        const representatives = [
          ...new Map(result.products.map((p) => [p.shop.id, p])).values(),
        ];
        const details = await Promise.allSettled(
          representatives.map((p) =>
            getJSON<ProductResponse>(
              `/api/products/${encodeURIComponent(p.id)}`,
            ),
          ),
        );
        if (active)
          setVouchers(
            new Set(
              details.flatMap((d) =>
                d.status === 'fulfilled' &&
                d.value.vouchers.some(
                  (v) => v.scope === 'shop' && v.shopId === d.value.shop.id,
                )
                  ? [d.value.shop.id]
                  : [],
              ),
            ),
          );
      })
      .catch((e) => {
        if (active) setError(e.message);
      });
    return () => {
      active = false;
    };
  }, [query, category, home, retry]);
  const grid = (products: ProductsResponse['products']) => (
    <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
      {products.map((p) => (
        <ProductCard
          key={p.id}
          product={p}
          shop={p.shop}
          hasVoucher={vouchers.has(p.shop.id)}
        />
      ))}
    </div>
  );
  return (
    <div className="space-y-10">
      {home && (
        <>
          <section className="rounded-3xl bg-orange-100 p-7 sm:p-12">
            <p className="text-xs font-bold uppercase tracking-widest text-orange-700">
              A little planning. A lot less searching.
            </p>
            <h1 className="mt-4 max-w-xl text-4xl font-bold leading-tight sm:text-5xl">
              Life has plans.
              <br />
              Let’s get you ready.
            </h1>
            <p className="mt-4 max-w-md text-slate-600">
              School starts, new homes, weekend escapes. Tell Kitly what’s next
              and find everything you need, together.
            </p>
            <Link
              href="/kit/new"
              className="mt-6 inline-block rounded-xl bg-accent px-5 py-3 font-semibold text-white"
            >
              Describe your need →
            </Link>
          </section>
          <section>
            <h2 className="mb-4 text-xl font-bold">Shop by occasion</h2>
            <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
              {events.map(([id, title, subtitle]) => (
                <a
                  href={`#${id}`}
                  key={id}
                  className="rounded-2xl border bg-white p-5"
                >
                  <h3 className="font-semibold">{title} ↗</h3>
                  <p className="mt-2 text-sm text-slate-500">{subtitle}</p>
                </a>
              ))}
            </div>
          </section>
          <section>
            <h2 className="mb-4 text-xl font-bold">Browse categories</h2>
            <div className="flex gap-3 overflow-x-auto pb-3">
              {categories.map((c) => (
                <Link
                  key={c.id}
                  href={`/categories/${c.id}`}
                  className="w-32 shrink-0 text-center text-sm"
                >
                  <CategoryTile category={c.id} />
                  <span className="mt-2 block">{c.label}</span>
                </Link>
              ))}
            </div>
          </section>
        </>
      )}
      {error ? (
        <div role="alert" className="rounded-xl border bg-white p-6">
          {error}
          <button
            className="ml-3 text-accent underline"
            onClick={() => setRetry((n) => n + 1)}
          >
            Try again
          </button>
        </div>
      ) : !data ? (
        <p role="status">Loading products…</p>
      ) : home ? (
        events.map(([event, title]) => {
          const products = data.products
            .filter((p) =>
              categories.some((c) => c.id === p.category && c.event === event),
            )
            .slice(0, 5);
          return (
            <section key={event} id={event} className="scroll-mt-6">
              <h2 className="mb-4 text-2xl font-bold">{title}</h2>
              {products.length ? (
                grid(products)
              ) : (
                <p className="text-slate-500">More products coming soon.</p>
              )}
            </section>
          );
        })
      ) : (
        <section>
          <h1 className="mb-2 text-3xl font-bold">
            {category
              ? categories.find((c) => c.id === category)?.label || 'Category'
              : query
                ? `Results for “${query}”`
                : 'All products'}
          </h1>
          <p className="mb-6 text-sm text-slate-500">
            {data.products.length} products
          </p>
          {data.products.length ? (
            grid(data.products)
          ) : (
            <p>
              No products found. Try another search or{' '}
              <Link href="/kit/new" className="text-accent underline">
                describe your need
              </Link>
              .
            </p>
          )}
        </section>
      )}
    </div>
  );
}
