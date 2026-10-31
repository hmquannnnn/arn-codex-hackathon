'use client';
import type { FollowUp } from '@/contract/types';
export function FollowUpView({
  followUp,
  disabled,
  onChoose,
}: {
  followUp: FollowUp | null | undefined;
  disabled: boolean;
  onChoose?: (suggestion: FollowUp['suggestions'][number]) => void;
}) {
  if (!followUp) return null;
  return (
    <section className="mt-4 space-y-3">
      <p className="text-sm font-semibold leading-6">{followUp.question}</p>
      <div className="flex flex-wrap gap-2">
        {followUp.suggestions.map((s) => (
          <button
            key={s.text}
            disabled={disabled || !onChoose}
            onClick={() => onChoose?.(s)}
            className="rounded-full border border-orange-200 bg-orange-50 px-3 py-2 text-xs text-orange-800 disabled:opacity-40"
          >
            {s.text}
          </button>
        ))}
      </div>
    </section>
  );
}
