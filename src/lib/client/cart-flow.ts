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

export function kitThreadPath(
  id: string,
  source: 'catalog' | 'cart_only' = 'catalog',
) {
  return `${source === 'cart_only' ? '/cart/kit/t' : '/kit/t'}/${encodeURIComponent(id)}`;
}

/** Cart-only confirmation selects an existing subset; only catalog discovery merges new lines. */
export function confirmKit(
  current: CartLine[],
  kit: CartLine[],
  shopping?: import('@/contract/types').KitPlan['shopping'],
) {
  const purchases = kitPurchases(kit);
  if (shopping?.source === 'cart_only') {
    for (const purchase of purchases) {
      const saved = shopping.cart.find(
        (line) => line.productId === purchase.productId,
      );
      if (!saved || saved.quantity < purchase.quantity)
        throw new Error('Selection exceeds the saved cart. Build a new kit.');
      const present = current.find(
        (line) => line.product.id === purchase.productId,
      );
      if (
        !present ||
        Math.min(present.quantity, present.product.stock) < purchase.quantity
      )
        throw new Error(
          'Your cart has changed. Review it and build a new kit.',
        );
    }
    return { cart: current, purchases };
  }
  return { cart: mergeKit(current, kit), purchases };
}
