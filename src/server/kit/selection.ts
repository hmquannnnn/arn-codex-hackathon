import type { Interest, KitPlan, KitSelection } from '@/contract/types';
import type { MatchResult } from '@/server/matcher';

/** Carry only buyer choices still offered under the new constraints. Budget is a warning, not a veto. */
export function retainSelection(
  selection: KitSelection | null,
  plan: KitPlan,
  matched: MatchResult,
  interests: Interest[],
): KitSelection | null {
  if (!selection) return null;
  const keys = new Set(plan.items.map(item => item.key));
  return {
    profile: selection.profile,
    picks: Object.fromEntries(Object.entries(selection.picks).filter(([key, id]) =>
      keys.has(key) && (
        matched.candidates[key]?.some(c => c.product.id === id) ||
        matched.noMatch.find(g => g.itemKey === key)?.closest?.candidate.product.id === id ||
        interests.some(i => i.itemKey === key && i.candidate.product.id === id)
      ),
    )),
    dropped: selection.dropped.filter(key => keys.has(key)),
  };
}
