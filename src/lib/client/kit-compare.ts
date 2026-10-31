import type { BasketOption } from '@/contract/types';
export function mergeOptions(options: BasketOption[]) {
  const seen = new Set<string>();
  // Prefer Balanced when several profiles have the same basket.
  return [...options]
    .sort(
      (a, b) =>
        Number(b.profile === 'balanced') - Number(a.profile === 'balanced'),
    )
    .filter((option) => {
      const key = JSON.stringify({
        lines: option.lines
          .map((l) => [l.itemKey, l.product.id, l.quantity])
          .sort(),
        total: option.grandTotal,
        gaps: option.noMatch.map((g) => g.itemKey).sort(),
        skipped: option.skipped.map((s) => s.itemKey).sort(),
      });
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .sort(
      (a, b) =>
        ['saver', 'balanced', 'premium'].indexOf(a.profile) -
        ['saver', 'balanced', 'premium'].indexOf(b.profile),
    );
}
