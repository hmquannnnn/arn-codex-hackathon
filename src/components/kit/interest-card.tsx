'use client';
import type { Interest } from '@/contract/types';
import { money } from '@/lib/client/store';
export function InterestCard({
  interest,
  limit,
  disabled,
  onSwitch,
}: {
  interest: Interest;
  limit?: number | null;
  disabled: boolean;
  onSwitch?: () => void;
}) {
  return (
    <div className="mt-3 rounded-xl border border-yellow-200 bg-yellow-50 p-4 text-sm">
      <p className="font-bold">💛 In your cart</p>
      <p className="mt-2 font-medium">{interest.candidate.product.title}</p>
      <p className="mt-2">
        <span className="text-slate-500">
          {money(interest.candidate.product.price)} →{' '}
        </span>
        <strong>{money(interest.priceAfterVoucher)}</strong>
        {interest.walletVoucherCode && ` with ${interest.walletVoucherCode}`}
      </p>
      {!!interest.overMaxPriceBy && (
        <p className="mt-2 text-xs text-amber-800">
          over your{' '}
          {limit
            ? limit % 1000 === 0
              ? `${limit / 1000}k`
              : money(limit)
            : 'price'}{' '}
          limit by {money(interest.overMaxPriceBy)}
        </p>
      )}
      {!!interest.missingTags.length && (
        <p className="mt-2 text-xs text-amber-800">
          missing: {interest.missingTags.join(', ')}
        </p>
      )}
      <button
        disabled={disabled || !onSwitch}
        onClick={onSwitch}
        className="mt-3 rounded-lg border bg-white px-3 py-2 text-xs font-semibold disabled:opacity-40"
      >
        Switch to this
      </button>
    </div>
  );
}
