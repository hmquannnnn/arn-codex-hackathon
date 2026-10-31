'use client';
import Link from 'next/link';
import { ShoppingBasket } from 'lucide-react';
import type { CartLine } from '@/lib/client/store';
import { CartKitSetup } from './cart-setup';
export function CartKitIntro({
  lines,
  keepProductIds,
  onKeep,
}: {
  lines: CartLine[];
  keepProductIds: string[];
  onKeep: (ids: string[]) => void;
}) {
  return (
    <div className="mx-auto max-w-xl py-4">
      <ShoppingBasket size={30} className="text-accent" />
      <h1 className="mt-4 text-3xl font-bold">Build from your cart</h1>
      <p className="mt-3 text-sm leading-6 text-slate-600">
        Tell us what you need and your budget. Choose which saved products to
        buy this time. Other products and unused quantities stay in your cart.
      </p>
      <CartKitSetup
        lines={lines}
        source="cart_only"
        fixedSource
        keepProductIds={keepProductIds}
        onSource={() => {}}
        onKeep={onKeep}
      />
      <Link href="/cart" className="text-sm font-semibold text-accent">
        Back to cart
      </Link>
    </div>
  );
}
