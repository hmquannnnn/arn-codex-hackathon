'use client';
import Link from 'next/link';
import { useState } from 'react';
import { ShoppingCart, Search, Sparkles } from 'lucide-react';
import { PersonaChip } from '@/components/persona-chip';
import { useCart } from './cart-context';
export function StoreHeader() {
  const [need, setNeed] = useState(false);
  const { lines } = useCart();
  return (
    <header className="border-b bg-white">
      <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-5 px-5 py-5">
        <Link
          href="/"
          className="text-2xl font-extrabold tracking-tight text-accent"
        >
          DemoMart<span className="ml-1 text-orange-300">.</span>
        </Link>
        <div className="order-last w-full flex-1 basis-full sm:order-none sm:basis-72">
          <div className="mb-2 flex gap-4 text-xs">
            <button
              onClick={() => setNeed(false)}
              aria-pressed={!need}
              className={!need ? 'font-bold text-accent' : ''}
            >
              Search products
            </button>
            <button
              onClick={() => setNeed(true)}
              aria-pressed={need}
              className={need ? 'font-bold text-accent' : ''}
            >
              Describe your need
            </button>
          </div>
          <form
            action={need ? '/kit/new' : '/search'}
            className="flex rounded-xl border bg-slate-50 p-1"
          >
            <input
              required
              name="q"
              aria-label={need ? 'Describe your need' : 'Search products'}
              placeholder={
                need
                  ? 'What are you getting ready for?'
                  : 'Search for something you need'
              }
              className="min-w-0 flex-1 bg-transparent px-3 py-2 text-sm outline-none"
            />
            <button
              aria-label="Search"
              className="rounded-lg bg-accent px-4 text-white"
            >
              {need ? <Sparkles size={19} /> : <Search size={19} />}
            </button>
          </form>
        </div>
        <PersonaChip />
        <Link href="/kit" className="text-sm font-medium">
          My kits
        </Link>
        <Link
          href="/cart"
          className="flex items-center gap-1 text-sm"
          aria-label={`Cart, ${lines.reduce((n, l) => n + l.quantity, 0)} items`}
        >
          <ShoppingCart size={21} />
          {lines.reduce((n, l) => n + l.quantity, 0)}
        </Link>
        <Link href="/seller" className="ml-auto text-xs text-slate-500">
          Seller Centre
        </Link>
      </div>
    </header>
  );
}
