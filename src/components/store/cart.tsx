'use client';
import Link from 'next/link';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import type { CheckoutResponse } from '@/contract/types';
import { cartSummary, getJSON, money } from '@/lib/client/store';
import { useCart } from './cart-context';
import { CartTotals } from './cart-totals';
export function Cart() {
  const { lines, quantity, clear } = useCart();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  const router = useRouter();
  async function checkout() {
    setPending(true);
    setError('');
    try {
      const receipt = await getJSON<CheckoutResponse>('/api/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          lines: lines.map((l) => ({
            productId: l.product.id,
            quantity: l.quantity,
          })),
        }),
      });
      sessionStorage.setItem('kitly-receipt', JSON.stringify(receipt));
      clear();
      router.push('/checkout/confirmation');
    } catch (e) {
      setError(
        e instanceof Error ? e.message : 'Checkout failed. Please try again.',
      );
      setPending(false);
    }
  }
  return (
    <div>
      <h1 className="mb-6 text-3xl font-bold">Your cart</h1>
      {!lines.length ? (
        <div className="rounded-2xl border bg-white p-10">
          <p>Your cart is waiting for your next plan.</p>
          <Link href="/" className="mt-4 inline-block text-accent">
            Explore the store →
          </Link>
        </div>
      ) : (
        <div className="grid gap-6 lg:grid-cols-[1fr_340px]">
          <div className="space-y-4">
            {cartSummary(lines).groups.map((g) => (
              <section
                key={g.shop.id}
                className="rounded-2xl border bg-white p-5"
              >
                <h2 className="mb-4 font-bold">{g.shop.name}</h2>
                {g.lines.map((l) => (
                  <div
                    key={l.product.id}
                    className="flex flex-wrap items-center justify-between gap-4 border-t py-4"
                  >
                    <div className="max-w-xs">
                      <Link
                        href={`/products/${l.product.id}`}
                        className="text-sm font-medium"
                      >
                        {l.product.title}
                      </Link>
                      <p className="mt-1 text-accent">
                        {money(l.product.price)}
                      </p>
                    </div>
                    <div className="flex items-center gap-3">
                      <button
                        disabled={pending}
                        aria-label={`Decrease ${l.product.title}`}
                        onClick={() => quantity(l.product.id, l.quantity - 1)}
                        className="rounded border px-3 py-1"
                      >
                        −
                      </button>
                      <span>{l.quantity}</span>
                      <button
                        disabled={pending || l.quantity >= l.product.stock}
                        aria-label={`Increase ${l.product.title}`}
                        onClick={() => quantity(l.product.id, l.quantity + 1)}
                        className="rounded border px-3 py-1 disabled:opacity-40"
                      >
                        +
                      </button>
                      <button
                        disabled={pending}
                        onClick={() => quantity(l.product.id, 0)}
                        className="text-xs text-slate-500 underline"
                      >
                        Remove
                      </button>
                    </div>
                  </div>
                ))}
                <p className="border-t pt-4 text-sm text-slate-500">
                  Shop shipping: {money(g.shop.shipFee)}
                </p>
              </section>
            ))}
          </div>
          <div>
            <CartTotals lines={lines} />
            <p className="my-4 text-xs text-slate-500">
              Demo checkout · no payment is collected. Vouchers shown on
              listings are not applied at checkout.
            </p>
            <button
              disabled={pending}
              onClick={checkout}
              className="w-full rounded-xl bg-accent p-4 font-bold text-white disabled:opacity-50"
            >
              {pending ? 'Placing order…' : 'Checkout'}
            </button>
            {error && (
              <p role="alert" className="mt-3 text-red-700">
                {error}
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
