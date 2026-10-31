'use client';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { checkoutRequestSchema } from '@/contract/schemas';
import type { BasketOption, CheckoutResponse } from '@/contract/types';
import { cartSummary, getJSON, money } from '@/lib/client/store';
import { useCart } from './cart-context';

export function Cart() {
  const { lines, quantity, purchased, ready } = useCart();
  const [selection, setSelection] = useState<Record<string, number> | null>(
    null,
  );
  const [quote, setQuote] = useState<BasketOption>();
  const [quoting, setQuoting] = useState(false);
  useEffect(() => {
    if (!ready || selection !== null) return;
    let selected = Object.fromEntries(
      lines.map((line) => [line.product.id, line.quantity]),
    );
    try {
      const saved = sessionStorage.getItem('kitly-cart-selection');
      if (saved) {
        const parsed = checkoutRequestSchema.shape.lines.element
          .array()
          .max(100)
          .parse(JSON.parse(saved));
        selected = Object.fromEntries(
          parsed.map((line) => [line.productId, line.quantity]),
        );
      }
    } catch {}
    setSelection(selected);
  }, [ready, lines, selection]);
  const selectedLines = lines.flatMap((line) => {
    const count = Math.min(line.quantity, selection?.[line.product.id] ?? 0);
    return count > 0 ? [{ productId: line.product.id, quantity: count }] : [];
  });
  const selectionJSON = JSON.stringify(selectedLines);
  const selectionReady = selection !== null;
  useEffect(() => {
    if (!selectionReady) return;
    sessionStorage.setItem('kitly-cart-selection', selectionJSON);
    setQuote(undefined);
    if (!JSON.parse(selectionJSON).length) {
      setQuoting(false);
      return;
    }
    const abort = new AbortController();
    setQuoting(true);
    setError('');
    getJSON<BasketOption>('/api/cart/quote', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ lines: JSON.parse(selectionJSON) }),
      signal: abort.signal,
    })
      .then((result) => {
        if (!abort.signal.aborted) setQuote(result);
      })
      .catch(() => {
        if (!abort.signal.aborted)
          setError(
            'Unable to price the selected products. Try changing your selection.',
          );
      })
      .finally(() => {
        if (!abort.signal.aborted) setQuoting(false);
      });
    return () => abort.abort();
  }, [selectionJSON, selectionReady]);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  const router = useRouter();
  async function checkout() {
    if (!quote || !selectedLines.length) return;
    setPending(true);
    setError('');
    try {
      const receipt = await getJSON<CheckoutResponse>('/api/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          lines: selectedLines,
          expectedTotal: quote.grandTotal,
        }),
      });
      sessionStorage.setItem('kitly-receipt', JSON.stringify(receipt));
      purchased(selectedLines);
      sessionStorage.removeItem('kitly-cart-selection');
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
      {!!lines.length && (
        <Link
          href="/kit/new?source=cart_only"
          className="mb-5 inline-block rounded-xl border border-orange-200 bg-orange-50 px-4 py-3 font-semibold text-accent"
        >
          Build a kit from my cart
        </Link>
      )}
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
                      <label className="mb-2 flex items-center gap-2 text-xs">
                        <input
                          type="checkbox"
                          aria-label={`Buy ${l.product.title}`}
                          disabled={pending}
                          checked={(selection?.[l.product.id] ?? 0) > 0}
                          onChange={(e) =>
                            setSelection((old) => ({
                              ...old,
                              [l.product.id]: e.target.checked ? l.quantity : 0,
                            }))
                          }
                        />
                        Buy this time
                      </label>
                      {(selection?.[l.product.id] ?? 0) > 0 && (
                        <label className="mb-2 block text-xs">
                          Buy quantity{' '}
                          <input
                            aria-label={`Buy quantity ${l.product.title}`}
                            type="number"
                            min={1}
                            max={l.quantity}
                            disabled={pending}
                            value={Math.min(
                              l.quantity,
                              selection?.[l.product.id] ?? 1,
                            )}
                            onChange={(e) =>
                              setSelection((old) => ({
                                ...old,
                                [l.product.id]: Math.max(
                                  1,
                                  Math.min(
                                    l.quantity,
                                    Number(e.target.value) || 1,
                                  ),
                                ),
                              }))
                            }
                            className="w-16 rounded border p-1"
                          />
                        </label>
                      )}
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
            <section
              className="space-y-3 rounded-2xl border bg-white p-5 text-sm"
              aria-label="Selected checkout total"
            >
              <h2 className="font-bold">
                Selected for this purchase · {selectedLines.length}
              </h2>
              {quote ? (
                <>
                  <p>Items: {money(quote.itemsTotal)}</p>
                  <p>Shipping: {money(quote.shippingTotal)}</p>
                  <p>Discounts: −{money(quote.discountTotal)}</p>
                  {quote.savings.map((saving, i) => (
                    <p key={i} className="text-xs text-emerald-700">
                      {saving.label} · {money(saving.amount)}
                    </p>
                  ))}
                  <p className="border-t pt-3 text-lg font-bold">
                    Total: {money(quote.grandTotal)}
                  </p>
                </>
              ) : (
                <p role="status">
                  {quoting
                    ? 'Calculating shipping and vouchers…'
                    : 'Select products to see your total.'}
                </p>
              )}
            </section>
            <p className="my-4 text-xs text-slate-500">
              Demo checkout · no payment is collected. Only selected quantities
              are purchased. Other products stay in your cart.
            </p>
            <button
              disabled={pending || quoting || !quote || !selectedLines.length}
              onClick={checkout}
              className="w-full rounded-xl bg-accent p-4 font-bold text-white disabled:opacity-50"
            >
              {pending ? 'Placing order…' : 'Checkout selected'}
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
