import type { CommerceAdapter } from '@/contract/commerce-adapter';
import type {
  BasketOption,
  Candidate,
  KitPlan,
  PlanItem,
  Product,
  Shop,
} from '@/contract/types';
import { today } from '@/server/today';

export interface MatchResult {
  candidates: Record<string, Candidate[]>;
  noMatch: BasketOption['noMatch'];
  matchedCounts: Record<string, number>;
  comparedProducts: number;
  comparedShops: number;
}
function arrival(product: Product): string {
  const date = new Date(`${today()}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + product.shipDaysMax);
  return date.toISOString().slice(0, 10);
}
function quality(product: Product, shop: Shop, item: PlanItem): number {
  const tagFit = item.niceToHaveTags.length
    ? item.niceToHaveTags.filter((tag) => product.tags.includes(tag)).length /
      item.niceToHaveTags.length
    : 1;
  const rating = Math.max(0, Math.min(1, product.rating / 5));
  const reviews = Math.max(
    0,
    Math.min(1, Math.log10(1 + product.reviewCount) / Math.log10(8001)),
  );
  const tier = { mall: 1, preferred: 0.75, regular: 0.5 }[shop.tier];
  return Math.max(
    0,
    Math.min(1, 0.35 * tagFit + 0.35 * rating + 0.18 * reviews + 0.12 * tier),
  );
}
function bestFirst(a: Candidate, b: Candidate): number {
  return (
    b.score - a.score ||
    a.product.price - b.product.price ||
    a.product.id.localeCompare(b.product.id)
  );
}

/** One marketplace read for all needs; exact matches and relaxed explanations stay separate. */
export async function matchPlan(
  plan: KitPlan,
  adapter: CommerceAdapter,
): Promise<MatchResult> {
  const categoryIds = [
    ...new Set(
      plan.items.flatMap((item) =>
        item.category === null ? [] : [item.category],
      ),
    ),
  ];
  const [products, shops] = await Promise.all([
    adapter.searchProducts({ categories: categoryIds }),
    adapter.listShops(),
  ]);
  const shopById = new Map(shops.map((shop) => [shop.id, shop]));
  const result: MatchResult = {
    candidates: {},
    noMatch: [],
    matchedCounts: {},
    comparedProducts: products.length,
    comparedShops: new Set(products.map((product) => product.shopId)).size,
  };
  for (const item of plan.items) {
    const stocked = products.filter(
      (product) =>
        product.category === item.category &&
        product.stock >= item.quantity &&
        shopById.has(product.shopId),
    );
    const scored = stocked.map((product): Candidate => ({
      product,
      shop: shopById.get(product.shopId)!,
      score: quality(product, shopById.get(product.shopId)!, item),
      matchedTags: [
        ...new Set([...item.mustHaveTags, ...item.niceToHaveTags]),
      ].filter((tag) => product.tags.includes(tag)),
      arrivesBy: arrival(product),
    }));
    const tagged = scored.filter((candidate) =>
      item.mustHaveTags.every((tag) => candidate.product.tags.includes(tag)),
    );
    const timely = (c: Candidate) =>
      plan.deadline === null || c.arrivesBy <= plan.deadline;
    const affordable = (c: Candidate) =>
      item.maxUnitPrice === null || c.product.price <= item.maxUnitPrice;
    const inTime = tagged.filter(timely);
    const exact = inTime.filter(affordable).sort(bestFirst);
    result.candidates[item.key] = exact;
    result.matchedCounts[item.key] = exact.length;
    if (exact.length) continue;
    const relaxed = scored.filter(timely).sort(bestFirst);
    const closest = relaxed.filter(affordable)[0] ?? relaxed[0];
    const reason =
      item.category === null
        ? 'no_category'
        : tagged.length === 0
          ? 'no_product_with_tags'
          : inTime.length === 0
            ? 'none_in_time'
            : 'none_in_budget';
    result.noMatch.push({
      itemKey: item.key,
      needLabel: item.needLabel,
      reason,
      closest: closest
        ? {
            candidate: closest,
            missingTags: item.mustHaveTags.filter(
              (tag) => !closest.product.tags.includes(tag),
            ),
            overMaxPriceBy:
              item.maxUnitPrice !== null &&
              closest.product.price > item.maxUnitPrice
                ? closest.product.price - item.maxUnitPrice
                : null,
          }
        : null,
    });
  }
  return result;
}
