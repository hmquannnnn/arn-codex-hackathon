'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { CircleCheck } from 'lucide-react';
import { checkoutResponseSchema } from '@/contract/schemas';
import type { CheckoutResponse } from '@/contract/types';
import { money } from '@/lib/client/store';
export function Confirmation() {
  const [receipt, setReceipt] = useState<CheckoutResponse | null>(null);
  useEffect(() => {
    try {
      const result = checkoutResponseSchema.safeParse(
        JSON.parse(sessionStorage.getItem('kitly-receipt') || 'null'),
      );
      if (result.success) setReceipt(result.data);
    } catch {}
  }, []);
  return (
    <div className="mx-auto max-w-lg rounded-3xl border bg-white p-8 text-center">
      <CircleCheck className="mx-auto text-emerald-600" size={48} />
      <h1 className="mt-5 text-3xl font-bold">
        {receipt ? 'You’re all set!' : 'Order confirmation'}
      </h1>
      {receipt ? (
        <>
          <p className="mt-4 text-slate-600">
            Your demo order has been confirmed. No payment was collected.
          </p>
          <p className="mt-4 break-all text-xs text-slate-500">
            Order {receipt.orderId}
          </p>
          <p className="mt-3 text-2xl font-bold">{money(receipt.grandTotal)}</p>
        </>
      ) : (
        <p className="mt-4">No recent order in this browser tab.</p>
      )}
      <Link
        href="/"
        className="mt-6 inline-block rounded-xl bg-accent px-5 py-3 text-white"
      >
        Continue shopping
      </Link>
    </div>
  );
}
