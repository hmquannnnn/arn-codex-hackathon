import type {
  BasketOption,
  Candidate,
  KitPlan,
  Voucher,
} from '@/contract/types';
import { priceBasket } from '@/server/optimizer';
import type { MatchResult } from '@/server/matcher';
import type { AlternativeFact } from './follow-up';
import { today } from '@/server/today';
/** Price each displayed alternative against the actual current lines, including buyer edits. */
export function alternativeFacts(
  plan: KitPlan,
  option: BasketOption,
  matched: MatchResult,
  vouchers: Voucher[],
): AlternativeFact[] {
  const picks: Record<string, Candidate> = Object.fromEntries(
    option.lines.map((line) => {
      const arrives = new Date(`${today()}T00:00:00Z`);
      arrives.setUTCDate(arrives.getUTCDate() + line.product.shipDaysMax);
      const candidate = matched.related[line.itemKey]?.find(
        (c) => c.product.id === line.product.id,
      ) ?? {
        product: line.product,
        shop: line.shop,
        score: 0,
        matchedTags: [],
        arrivesBy: arrives.toISOString().slice(0, 10),
      };
      return [line.itemKey, candidate];
    }),
  );
  return option.lines.flatMap((line) =>
    line.alternatives.map((c) => {
      const total = priceBasket(
        {
          plan,
          candidates: matched.candidates,
          vouchers,
          noMatch: option.noMatch,
        },
        { ...picks, [line.itemKey]: c },
        option.profile,
      ).grandTotal;
      return {
        itemKey: line.itemKey,
        productId: c.product.id,
        title: c.product.title,
        shop: c.shop.name,
        price: c.product.price,
        rating: c.product.rating,
        arrivesBy: c.arrivesBy,
        grandTotal: total,
        overBy: Math.max(0, total - (plan.budget ?? Infinity)),
      };
    }),
  );
}
