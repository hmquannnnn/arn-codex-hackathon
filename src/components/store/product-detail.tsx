'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import type { ProductResponse } from '@/contract/types';
import { arrivalDate, getJSON, money } from '@/lib/client/store';
import { CategoryTile } from './product-card';
import { useCart } from './cart-context';
export function ProductDetail({ id, today }: { id: string; today: string }) {
  const [data, setData] = useState<ProductResponse | null>(null);
  const [error, setError] = useState('');
  const [added, setAdded] = useState(false);
  const cart = useCart();
  useEffect(() => {
    let active = true;
    getJSON<ProductResponse>(`/api/products/${encodeURIComponent(id)}`)
      .then((d) => {
        if (active) setData(d);
      })
      .catch((e) => {
        if (active) setError(e.message);
      });
    return () => {
      active = false;
    };
  }, [id]);
  if (error)
    return (
      <p role="alert">
        {error}{' '}
        <Link href="/" className="text-accent">
          Back to store
        </Link>
      </p>
    );
  if (!data) return <p role="status">Loading product…</p>;
  const { product: p, shop, vouchers } = data;
  return (
    <article className="grid gap-8 md:grid-cols-2">
      <div>
        <CategoryTile category={p.category} large />
        <section className="mt-6 rounded-2xl border bg-white p-6">
          <h2 className="font-bold">About this product</h2>
          <p className="mt-3 leading-relaxed text-slate-600">{p.description}</p>
          <div className="mt-4 flex flex-wrap gap-2">
            {p.tags.map((tag) => (
              <span
                key={tag}
                className="rounded-full bg-slate-100 px-3 py-1 text-xs"
              >
                {tag}
              </span>
            ))}
          </div>
          <table className="mt-5 w-full text-left text-sm">
            <caption className="mb-2 text-left font-semibold">
              Product details
            </caption>
            <tbody>
              {Object.entries(p.attributes).map(([key, value]) => (
                <tr key={key} className="border-t">
                  <th className="py-3 font-medium">{key}</th>
                  <td>{value}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      </div>
      <div>
        <Link
          href={`/categories/${p.category}`}
          className="text-sm text-accent"
        >
          Browse category →
        </Link>
        <h1 className="mt-4 text-3xl font-bold">{p.title}</h1>
        <p className="mt-3 text-sm text-slate-500">
          ★ {p.rating} · {p.reviewCount} reviews · {p.soldCount} sold
        </p>
        {p.updatedForDemandAt && (
          <p className="mt-3 text-sm text-emerald-700">Updated for this need</p>
        )}
        <p className="my-6 text-4xl font-bold text-accent">{money(p.price)}</p>
        <p className="text-sm">
          Arrives by {arrivalDate(today, p.shipDaysMax)}
        </p>
        <p className="mt-2 text-sm text-slate-500">
          Shipping {money(shop.shipFee)} · {p.stock} available
        </p>
        <button
          disabled={!p.stock}
          onClick={() => {
            cart.add({ product: p, shop, quantity: 1 });
            setAdded(true);
          }}
          className="mt-6 w-full rounded-xl bg-accent px-6 py-4 font-semibold text-white disabled:bg-slate-300"
        >
          {p.stock ? 'Add to cart' : 'Out of stock'}
        </button>
        {added && (
          <p role="status" className="mt-3 text-emerald-700">
            Added to cart.{' '}
            <Link href="/cart" className="underline">
              View cart →
            </Link>
          </p>
        )}
        <section className="mt-6 rounded-2xl border bg-white p-5">
          <h2 className="font-bold">{shop.name}</h2>
          <p className="mt-2 text-sm capitalize text-slate-500">
            {shop.tier} · ★ {shop.rating} · {shop.city}
          </p>
        </section>
        <section className="mt-6">
          <h2 className="font-bold">Available vouchers</h2>
          {vouchers.length ? (
            vouchers.map((v) => (
              <div
                key={v.id}
                className="mt-3 rounded-xl border border-dashed border-orange-300 bg-orange-50 p-4"
              >
                <p className="font-semibold">
                  {v.label} · {v.code}
                </p>
                <p className="mt-1 text-xs text-slate-600">
                  Min. spend {money(v.minSpend)} · valid until {v.validUntil}
                </p>
              </div>
            ))
          ) : (
            <p className="mt-2 text-sm text-slate-500">
              No vouchers available.
            </p>
          )}
        </section>
      </div>
    </article>
  );
}
