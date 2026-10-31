import type { KitPlan, PlanDiff, PlanItem } from '@/contract/types';

function sameTags(a: string[], b: string[]): boolean {
  const first = new Set(a),
    second = new Set(b);
  return (
    first.size === second.size && [...first].every((tag) => second.has(tag))
  );
}
function sameItem(a: PlanItem, b: PlanItem): boolean {
  return (
    a.needLabel === b.needLabel &&
    a.category === b.category &&
    a.required === b.required &&
    a.quantity === b.quantity &&
    a.maxUnitPrice === b.maxUnitPrice &&
    sameTags(a.mustHaveTags, b.mustHaveTags) &&
    sameTags(a.niceToHaveTags, b.niceToHaveTags)
  );
}

/** Item-key diff follows each plan's display order; plan-wide metadata stays outside item changes. */
export function diffPlans(previous: KitPlan, next: KitPlan): PlanDiff {
  const before = new Map(previous.items.map((item) => [item.key, item]));
  const after = new Map(next.items.map((item) => [item.key, item]));
  return {
    added: next.items
      .filter((item) => !before.has(item.key))
      .map((item) => item.key),
    removed: previous.items
      .filter((item) => !after.has(item.key))
      .map((item) => item.key),
    changed: next.items
      .filter(
        (item) =>
          before.has(item.key) && !sameItem(before.get(item.key)!, item),
      )
      .map((item) => item.key),
  };
}
