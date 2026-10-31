'use client';
import type { BasketOption, FitSuggestion } from '@/contract/types';
import { money } from '@/lib/client/store';
export function BudgetWarning({
  option,
  budget,
  disabled,
  onFit,
}: {
  option: BasketOption;
  budget: number | null;
  disabled: boolean;
  onFit?: (fit: FitSuggestion) => void;
}) {
  if (option.status !== 'over_budget') return null;
  const over =
    option.overBy ??
    (budget === null ? 0 : Math.max(0, option.grandTotal - budget));
  return (
    <div
      role="alert"
      className="space-y-3 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800"
    >
      <p className="font-semibold">Over budget by {money(over)}</p>
      <p>{option.minimumCost === undefined ? 'Current basket' : 'Minimum cost'}: {money(option.minimumCost ?? option.grandTotal)}</p>
      {option.costDrivers?.map((d) => (
        <p key={d} className="text-xs">
          {d}
        </p>
      ))}
      {option.fit?.map((fit) => (
        <button
          key={fit.id}
          disabled={disabled || !onFit}
          onClick={() => onFit?.(fit)}
          className="block w-full rounded-lg border border-red-200 bg-white p-3 text-left text-xs disabled:opacity-50"
        >
          <span className="font-semibold">{fit.label}</span>
          <span className="mt-1 block">New total {money(fit.grandTotal)}</span>
          {fit.dropsMustHave && (
            <span className="mt-2 inline-block rounded bg-amber-100 px-2 py-1 text-amber-800">
              removes a must-have
            </span>
          )}
        </button>
      ))}
    </div>
  );
}
