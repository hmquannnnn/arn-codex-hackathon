import type {
  BasketOption,
  Candidate,
  Profile,
  ShopGroup,
  Voucher,
} from '@/contract/types';
import { inventoryConflicts } from './inventory';
import { today } from '@/server/today';
import type { OptimizerInput } from './types';

function discount(voucher: Voucher, amount: number) {
  const raw =
    voucher.kind === 'percent'
      ? Math.floor((amount * voucher.value) / 100)
      : voucher.value;
  return Math.max(0, Math.min(amount, raw, voucher.maxDiscount ?? Infinity));
}

/** Price the chosen products exactly; no candidate search or external I/O. */
export function priceBasket(
  input: OptimizerInput,
  picks: Record<string, Candidate>,
  profile: Profile,
): BasketOption {
  const lines: BasketOption['lines'] = [];
  const groups = new Map<string, ShopGroup>();
  for (const item of input.plan.items) {
    const candidate = picks[item.key];
    if (!candidate) continue;
    const { product, shop } = candidate;
    const lineTotal = product.price * item.quantity;
    const alternativeShops = new Set<string>();
    const alternatives = [...(input.candidates[item.key] ?? [])]
      .filter(
        (c) =>
          (input.plan.shopping || c.shop.id !== shop.id) &&
          c.product.id !== product.id,
      )
      .filter(
        (c) =>
          !input.plan.shopping ||
          !inventoryConflicts(input.plan, { ...picks, [item.key]: c }).length,
      )
      .sort(
        (a, b) =>
          b.score - a.score ||
          a.product.price - b.product.price ||
          a.product.id.localeCompare(b.product.id),
      )
      .filter((c) => {
        if (input.plan.shopping) return true;
        if (alternativeShops.has(c.shop.id)) return false;
        alternativeShops.add(c.shop.id);
        return true;
      })
      .slice(0, 2);
    lines.push({
      itemKey: item.key,
      product,
      shop,
      quantity: item.quantity,
      lineTotal,
      reason:
        input.plan.language === 'vi'
          ? `Đánh giá ${product.rating}/5, nhận trước ${candidate.arrivesBy}`
          : `Rated ${product.rating}/5, arrives ${candidate.arrivesBy}`,
      alternatives,
    });
    const group = groups.get(shop.id) ?? {
      shopId: shop.id,
      shopName: shop.name,
      subtotal: 0,
      shipping: shop.shipFee,
      shopDiscount: 0,
      voucherCodes: [],
    };
    group.subtotal += lineTotal;
    groups.set(shop.id, group);
  }
  const shops = [...groups.values()];
  const itemsTotal = lines.reduce((sum, line) => sum + line.lineTotal, 0);
  const shippingTotal = shops.reduce((sum, shop) => sum + shop.shipping, 0);
  const savings: BasketOption['savings'] = [];
  const vouchers = input.vouchers.filter((v) => v.validUntil >= today());
  function addSaving(voucher: Voucher, amount: number, shopName?: string) {
    if (amount <= 0) return;
    const wallet = voucher.ownerPersona !== null;
    const label = wallet
      ? `${input.plan.language === 'vi' ? 'Voucher trong ví của bạn' : 'Your wallet voucher'} ${voucher.label}`
      : `${shopName ? `${shopName}: ` : ''}${voucher.label}`;
    savings.push({ label, amount, ...(wallet ? { wallet: true } : {}) });
  }
  for (const group of shops) {
    const eligible = vouchers.filter(
      (v) =>
        v.scope === 'shop' &&
        v.shopId === group.shopId &&
        v.kind !== 'freeship' &&
        group.subtotal >= v.minSpend,
    );
    const best = eligible.sort(
      (a, b) => discount(b, group.subtotal) - discount(a, group.subtotal),
    )[0];
    if (best && discount(best, group.subtotal) > 0) {
      group.shopDiscount = discount(best, group.subtotal);
      group.voucherCodes.push(best.code);
      addSaving(best, group.shopDiscount, group.shopName);
    }
    // T02's shipping rule is the public platform FREESHIP voucher; no shop-shipping vouchers are planted.
    const free = vouchers
      .filter(
        (v) =>
          v.scope === 'platform' &&
          v.kind === 'freeship' &&
          group.subtotal >= v.minSpend,
      )
      .sort(
        (a, b) => discount(b, group.shipping) - discount(a, group.shipping),
      )[0];
    if (free && discount(free, group.shipping) > 0) {
      group.voucherCodes.push(free.code);
      addSaving(free, discount(free, group.shipping), group.shopName);
    }
  }
  const shopDiscount = shops.reduce(
    (sum, group) => sum + group.shopDiscount,
    0,
  );
  // Platform eligibility uses gross merchandise; its percentage applies after shop discounts.
  const remainingItems = itemsTotal - shopDiscount;
  const platform = vouchers
    .filter(
      (v) =>
        v.scope === 'platform' &&
        v.kind !== 'freeship' &&
        itemsTotal >= v.minSpend,
    )
    .sort(
      (a, b) => discount(b, remainingItems) - discount(a, remainingItems),
    )[0];
  if (platform) addSaving(platform, discount(platform, remainingItems));
  const discountTotal = savings.reduce((sum, saving) => sum + saving.amount, 0);
  const grandTotal = itemsTotal + shippingTotal - discountTotal;
  const noMatch = [...(input.noMatch ?? [])];
  const skipped: BasketOption['skipped'] = [];
  for (const item of input.plan.items) {
    if (picks[item.key] || noMatch.some((gap) => gap.itemKey === item.key))
      continue;
    if (!input.candidates[item.key]?.length)
      noMatch.push({
        itemKey: item.key,
        needLabel: item.needLabel,
        reason: item.category === null ? 'no_category' : 'no_product_with_tags',
        closest: null,
      });
    else if (!item.required)
      skipped.push({
        itemKey: item.key,
        needLabel: item.needLabel,
        reason: 'budget',
      });
  }
  return {
    profile,
    status:
      input.plan.budget !== null && grandTotal > input.plan.budget
        ? 'over_budget'
        : 'ok',
    lines,
    noMatch,
    skipped,
    shops,
    itemsTotal,
    shippingTotal,
    discountTotal,
    grandTotal,
    savings,
  };
}
