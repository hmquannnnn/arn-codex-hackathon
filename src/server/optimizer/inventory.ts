import type { Candidate, KitPlan } from '@/contract/types';
/** Shared by search, explicit selections and fit suggestions. */
export function inventoryConflicts(
  plan: KitPlan,
  picks: Record<string, Candidate>,
): string[] {
  const used = new Map<string, number>();
  const conflicts: string[] = [];
  const quantities = new Map(
    plan.shopping?.cart.map((line) => [line.productId, line.quantity]) ?? [],
  );
  for (const item of [...plan.items].sort(
    (a, b) => Number(b.required) - Number(a.required),
  )) {
    const candidate = picks[item.key];
    if (!candidate) continue;
    const id = candidate.product.id;
    const amount = (used.get(id) ?? 0) + item.quantity;
    const limit =
      plan.shopping?.source === 'cart_only'
        ? Math.min(candidate.product.stock, quantities.get(id) ?? 0)
        : candidate.product.stock;
    if (amount > limit) conflicts.push(item.key);
    else used.set(id, amount);
  }
  return conflicts;
}
