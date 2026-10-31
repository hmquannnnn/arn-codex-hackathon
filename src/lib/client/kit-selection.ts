import type {
  FitSuggestion,
  KitSelection,
  KitVersion,
  Profile,
} from '@/contract/types';
export function selectionFor(
  version: KitVersion,
  profile: Profile,
): KitSelection {
  return version.selection?.profile === profile
    ? structuredClone(version.selection)
    : { profile, picks: {}, dropped: [] };
}
export function pickProduct(
  selection: KitSelection,
  key: string,
  productId: string,
): KitSelection {
  return {
    ...selection,
    picks: { ...selection.picks, [key]: productId },
    dropped: selection.dropped.filter((k) => k !== key),
  };
}
/** Selection changes only. All prices and totals are returned by the API. */
export function applyFit(
  selection: KitSelection,
  fit: FitSuggestion,
): KitSelection {
  const removed = new Set(fit.removeItemKeys);
  const swaps = Object.fromEntries(
    fit.swaps.map((s) => [s.itemKey, s.productId]),
  );
  return {
    profile: selection.profile,
    picks: {
      ...Object.fromEntries(
        Object.entries(selection.picks).filter(([key]) => !removed.has(key)),
      ),
      ...swaps,
    },
    dropped: [...new Set([...selection.dropped, ...removed])].filter(
      (key) => !(key in swaps),
    ),
  };
}
