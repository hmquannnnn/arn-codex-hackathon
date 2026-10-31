import type {
  BasketOption,
  KitPlan,
  Persona,
  SalesContext,
  Voucher,
} from '@/contract/types';
export const daysBetween = (from: string, to: string) =>
  Math.round((Date.parse(to) - Date.parse(from)) / 86400000);
/** Facts, not recommendations: these are the only personal sales claims the model may make. */
export function buildSalesContext(
  plan: KitPlan,
  option: BasketOption,
  persona: Persona,
  vouchers: Voucher[],
  today: string,
  shops: import('@/contract/types').Shop[] = [],
): SalesContext {
  const personal = persona.id !== 'guest';
  const active = vouchers.filter(
    (v) =>
      v.validUntil >= today &&
      (v.ownerPersona === null || (personal && v.ownerPersona === persona.id)),
  );
  const walletVouchers = personal
    ? active
        .filter((v) => v.ownerPersona === persona.id)
        .map((v) => ({
          code: v.code,
          label: v.label,
          validUntil: v.validUntil,
          daysToExpiry: daysBetween(today, v.validUntil),
          usedInBasket:
            option.shops.some((s) => s.voucherCodes.includes(v.code)) ||
            option.savings.some((s) => s.wallet && s.label.includes(v.label)),
        }))
    : [];
  const interests = personal
    ? (option.interests ?? []).map((i) => ({
        itemKey: i.itemKey,
        title: i.candidate.product.title,
        price: i.candidate.product.price,
        priceAfterVoucher: i.priceAfterVoucher,
        voucherCode: i.walletVoucherCode,
        overMaxPriceBy: i.overMaxPriceBy,
      }))
    : [];
  const freeshipGaps = option.shops.flatMap((shop) => {
    const missing = Math.min(
      ...active
        .filter(
          (v) =>
            v.kind === 'freeship' &&
            (v.scope === 'platform' || v.shopId === shop.shopId),
        )
        .map((v) => v.minSpend - shop.subtotal),
    );
    return missing > 0 && missing <= 100000
      ? [{ shopName: shop.shopName, missing }]
      : [];
  });
  const favoriteShopPromos = personal
    ? active
        .filter((v) => v.shopId && persona.favoriteShopIds.includes(v.shopId))
        .flatMap((v) => {
          const name =
            shops.find((s) => s.id === v.shopId)?.name ??
            option.shops.find((s) => s.shopId === v.shopId)?.shopName ??
            option.interests?.find((i) => i.candidate.shop.id === v.shopId)
              ?.candidate.shop.name;
          return name ? [{ shopName: name, code: v.code, label: v.label }] : [];
        })
    : [];
  const daysLeft = plan.deadline ? daysBetween(today, plan.deadline) : null;
  const hooks: SalesContext['hooks'] = [];
  if (daysLeft !== null && daysLeft > 2 && daysLeft <= 3)
    hooks.push('deadline_soon');
  if (interests.length) hooks.push('cart_interest');
  if (walletVouchers.some((v) => v.daysToExpiry <= 2))
    hooks.push('voucher_expiring');
  if (freeshipGaps.length) hooks.push('freeship_gap');
  if (favoriteShopPromos.length) hooks.push('favorite_shop_promo');
  return {
    today,
    deadline: plan.deadline,
    daysLeft,
    address:
      personal && persona.address
        ? `${persona.address.district}, ${persona.address.city}`
        : null,
    interests,
    walletVouchers,
    freeshipGaps,
    favoriteShopPromos,
    hooks,
  };
}
