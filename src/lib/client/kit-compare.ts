import type { BasketOption, PlanItem, Profile } from '@/contract/types';
import { money } from './store';
const profiles: Profile[] = ['saver', 'balanced', 'premium'];
const title = (profile: Profile) => profile[0].toUpperCase() + profile.slice(1);
export type ComparedOption = BasketOption & {
  profiles: Profile[];
  label: string;
};
export function mergeOptions(options: BasketOption[]): ComparedOption[] {
  const groups = new Map<string, BasketOption[]>();
  for (const profile of profiles) {
    const option = options.find((o) => o.profile === profile);
    if (!option) continue;
    const key = JSON.stringify([
      option.grandTotal,
      option.lines
        .map((l) => [l.product.id, l.quantity])
        .sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b))),
    ]);
    groups.set(key, [...(groups.get(key) ?? []), option]);
  }
  return [...groups.values()].map((group) => ({
    ...(group.find((o) => o.profile === 'balanced') ?? group[0]),
    profiles: group.map((o) => o.profile),
    label: group.map((o) => title(o.profile)).join(' = '),
  }));
}
/** Describes only observed differences; all basket pricing remains server-owned. */
export function compareToBalanced(
  option: BasketOption,
  balanced: BasketOption | undefined,
  items: PlanItem[],
): string {
  if (!balanced) return 'Comparison unavailable.';
  if (option.profile === 'balanced') return 'Balanced · best value baseline.';
  const delta = option.grandTotal - balanced.grandTotal;
  const changes: string[] = [];
  const label = (key: string) =>
    items.find((i) => i.key === key)?.needLabel ?? 'item';
  for (const line of option.lines) {
    const other = balanced.lines.find((l) => l.itemKey === line.itemKey);
    if (!other) changes.push(`adds ${label(line.itemKey)}`);
    else if (other.product.id !== line.product.id) {
      const description =
        line.product.rating > other.product.rating
          ? 'higher-rated'
          : line.product.price < other.product.price
            ? 'cheaper'
            : 'different';
      changes.push(`${description} ${label(line.itemKey)}`);
    } else if (other.quantity !== line.quantity)
      changes.push(`different quantity of ${label(line.itemKey)}`);
  }
  for (const line of balanced.lines)
    if (!option.lines.some((l) => l.itemKey === line.itemKey))
      changes.push(`without ${label(line.itemKey)}`);
  return `${delta < 0 ? '−' : delta > 0 ? '+' : ''}${money(Math.abs(delta))} vs Balanced${changes.length ? ` · ${changes.join(', ')}` : ' · same products and quantities'}`;
}
