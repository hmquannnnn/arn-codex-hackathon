import type {
  BasketOption,
  Candidate,
  Interest,
  KitPlan,
  Persona,
  Voucher,
} from '@/contract/types';
/** Cart affinity is deliberately separate from the exact candidate filter. */
export function findInterests(
  plan: KitPlan,
  option: Pick<BasketOption, 'lines'>,
  candidates: Record<string, Candidate[]>,
  persona: Persona,
  vouchers: Voucher[],
  today: string,
): Interest[] {
  if (persona.id === 'guest' || plan.shopping) return [];
  return plan.items.flatMap((item) =>
    persona.cart.flatMap((cart) => {
      const candidate = candidates[item.key]?.find(
        (c) => c.product.id === cart.productId,
      );
      if (
        !candidate ||
        candidate.product.category !== item.category ||
        candidate.product.stock < item.quantity ||
        (plan.deadline && candidate.arrivesBy > plan.deadline) ||
        option.lines.some(
          (l) => l.itemKey === item.key && l.product.id === cart.productId,
        )
      )
        return [];
      const price = candidate.product.price;
      const eligible = vouchers.filter(
        (v) =>
          v.validUntil >= today &&
          (v.ownerPersona === null || v.ownerPersona === persona.id) &&
          v.kind !== 'freeship' &&
          price >= v.minSpend &&
          (v.scope === 'platform' || v.shopId === candidate.shop.id),
      );
      const discount = (v: Voucher) =>
        Math.max(
          0,
          Math.min(
            price,
            v.maxDiscount ?? Infinity,
            v.kind === 'percent'
              ? Math.floor((price * v.value) / 100)
              : v.value,
          ),
        );
      const best = eligible.sort(
        (a, b) => discount(b) - discount(a) || a.code.localeCompare(b.code),
      )[0];
      const priceAfterVoucher = price - (best ? discount(best) : 0);
      return [
        {
          itemKey: item.key,
          candidate,
          addedToCartAt: cart.addedAt,
          walletVoucherCode: best?.code ?? null,
          priceAfterVoucher,
          overMaxPriceBy:
            item.maxUnitPrice !== null && priceAfterVoucher > item.maxUnitPrice
              ? priceAfterVoucher - item.maxUnitPrice
              : null,
          missingTags: item.mustHaveTags.filter(
            (t) => !candidate.product.tags.includes(t),
          ),
        },
      ];
    }),
  );
}
