import type { DemandItemRow, Gap, InsightsResponse } from '@/contract/types';
export function gapKey(row: Pick<DemandItemRow, 'category' | 'tags'>) {
  return row.category === null
    ? 'none|'
    : `${row.category}|${[...new Set(row.tags)].sort().join(',')}`;
}
// Stable domain labels for the planted demo needs; query wording remains free-form.
const gapLabels: Record<string, string> = {
  'school-backpack|anti-hunchback': 'Anti-hunchback backpack',
  'kids-raincoat|backpack-cover': 'Kids raincoat with backpack cover',
  'kids-desk-lamp|anti-blue-light': 'Anti-blue-light kids desk lamp',
};
function labels(rows: DemandItemRow[]) {
  const counts = new Map<string, number>();
  for (const row of rows)
    counts.set(row.needLabel, (counts.get(row.needLabel) ?? 0) + 1);
  return [...counts]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .map(([label]) => label);
}
function percentile(values: number[], q: number) {
  const sorted = [...values].sort((a, b) => a - b);
  const i = (sorted.length - 1) * q,
    lo = Math.floor(i);
  return Math.round(
    sorted[lo] + (sorted[Math.ceil(i)] - sorted[lo]) * (i - lo),
  );
}
export function aggregateDemand(
  rows: DemandItemRow[],
  window: InsightsResponse['window'],
): Pick<InsightsResponse, 'gaps' | 'combos' | 'topNeeds'> {
  const until = `${window.today}T23:59:59.999Z`;
  const current = rows.filter(
    (r) => r.createdAt >= window.thisWeekFrom && r.createdAt <= until,
  );
  const previous = rows.filter(
    (r) =>
      r.createdAt >= window.lastWeekFrom && r.createdAt < window.thisWeekFrom,
  );
  const sessions = new Map<string, Set<string>>();
  for (const row of current) {
    const categories = sessions.get(row.sessionId) ?? new Set<string>();
    if (row.category) categories.add(row.category);
    sessions.set(row.sessionId, categories);
  }
  const groups = new Map<string, DemandItemRow[]>();
  for (const row of current.filter((r) => r.matchedCount < 2)) {
    const key = gapKey(row);
    groups.set(key, [...(groups.get(key) ?? []), row]);
  }
  const gaps: Gap[] = [];
  for (const [key, group] of groups) {
    const ids = new Set(group.map((r) => r.sessionId));
    if (ids.size < 3) continue;
    const { category } = group[0],
      tags = category === null ? [] : [...new Set(group[0].tags)].sort();
    const hintBySession = new Map<string, number>();
    for (const row of group)
      if (row.budgetHint !== null && !hintBySession.has(row.sessionId))
        hintBySession.set(row.sessionId, row.budgetHint);
    const hints = [...hintBySession.values()];
    const together = new Map<string, number>();
    for (const id of ids)
      for (const cat of sessions.get(id) ?? [])
        if (cat !== category) together.set(cat, (together.get(cat) ?? 0) + 1);
    gaps.push({
      key,
      type: 'assortment_gap',
      needLabel:
        category === null
          ? `Not in catalog: ${labels(group).slice(0, 2).join(', ')}`
          : (gapLabels[key] ?? labels(group)[0]),
      category,
      tags,
      thisWeek: ids.size,
      lastWeek: new Set(
        previous
          .filter((r) => r.matchedCount < 2 && gapKey(r) === key)
          .map((r) => r.sessionId),
      ).size,
      matchingProducts: 0,
      priceBand: hints.length
        ? { p25: percentile(hints, 0.25), p75: percentile(hints, 0.75) }
        : null,
      neededWith: [...together]
        .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
        .slice(0, 3)
        .map(([category, n]) => ({ category, share: n / ids.size })),
      advice: '',
      appliedFix: null,
    });
  }
  const combos = new Map<string, number>();
  for (const categories of sessions.values()) {
    const cats = [...categories].sort();
    for (let i = 0; i < cats.length; i++)
      for (let j = i + 1; j < cats.length; j++) {
        const key = [cats[i], cats[j]].join('|');
        combos.set(key, (combos.get(key) ?? 0) + 1);
        for (let k = j + 1; k < cats.length; k++) {
          const triple = [cats[i], cats[j], cats[k]].join('|');
          combos.set(triple, (combos.get(triple) ?? 0) + 1);
        }
      }
  }
  const events = new Map<DemandItemRow['event'], Set<string>>();
  for (const row of current) {
    const ids = events.get(row.event) ?? new Set<string>();
    ids.add(row.sessionId);
    events.set(row.event, ids);
  }
  return {
    gaps,
    combos: [...combos]
      .sort(
        (a, b) =>
          b[1] - a[1] ||
          b[0].split('|').length - a[0].split('|').length ||
          a[0].localeCompare(b[0]),
      )
      .slice(0, 5)
      .map(([key, count]) => ({ categories: key.split('|'), count })),
    topNeeds: [...events]
      .map(([event, ids]) => ({ event, count: ids.size }))
      .sort((a, b) => b.count - a.count || a.event.localeCompare(b.event)),
  };
}
