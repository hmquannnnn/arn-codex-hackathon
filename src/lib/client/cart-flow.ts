import type { CartLine } from './store';
/** Kit quantities are desired purchase amounts, not an increment to saved quantities. */
export function mergeKit(current: CartLine[], kit: CartLine[]): CartLine[] {
  const wanted = new Map<string, CartLine>();
  for (const line of kit) {
    const prior = wanted.get(line.product.id);
    wanted.set(line.product.id, {
      ...line,
      quantity: (prior?.quantity ?? 0) + line.quantity,
    });
  }
  const result = current.map((line) => {
    const selected = wanted.get(line.product.id);
    wanted.delete(line.product.id);
    return selected
      ? {
          ...selected,
          quantity: Math.min(
            selected.product.stock,
            Math.max(line.quantity, selected.quantity),
          ),
        }
      : line;
  });
  return [...result, ...wanted.values()];
}
export function subtractPurchased(
  current: CartLine[],
  purchased: { productId: string; quantity: number }[],
): CartLine[] {
  const amounts = new Map<string, number>();
  for (const line of purchased)
    amounts.set(
      line.productId,
      (amounts.get(line.productId) ?? 0) + line.quantity,
    );
  return current
    .map((line) => ({
      ...line,
      quantity: Math.max(
        0,
        line.quantity - (amounts.get(line.product.id) ?? 0),
      ),
    }))
    .filter((line) => line.quantity > 0);
}

export function kitPurchases(kit: CartLine[]) {
  const amounts = new Map<string, number>();
  for (const line of kit)
    amounts.set(
      line.product.id,
      (amounts.get(line.product.id) ?? 0) + line.quantity,
    );
  return [...amounts].map(([productId, quantity]) => ({ productId, quantity }));
}
