import type {
  Candidate,
  KitPlan,
  KitSelection,
  Voucher,
} from '@/contract/types';
import type { MatchResult } from '@/server/matcher';
import { optimize } from './index';
import { priceBasket } from './pricing';
import { fitToBudget } from './fit';
import { HttpError } from '@/server/http';

/** Buyer selections overlay the requested optimizer profile; unselected lines remain unchanged. */
export function priceSelection(
  plan: KitPlan,
  matched: Pick<MatchResult, 'candidates' | 'noMatch'>,
  selection: KitSelection,
  vouchers: Voucher[],
  interests: import('@/contract/types').Interest[] = [],
) {
  const input = {
    plan,
    candidates: matched.candidates,
    noMatch: matched.noMatch,
    vouchers,
  };
  const base = optimize(input, selection.profile);
  const picks: Record<string, Candidate> = Object.fromEntries(
    base.lines.map((line) => [
      line.itemKey,
      matched.candidates[line.itemKey].find(
        (c) => c.product.id === line.product.id,
      )!,
    ]),
  );
  const added: string[] = [];
  const keys = new Set(plan.items.map((item) => item.key));
  for (const key of [...Object.keys(selection.picks), ...selection.dropped])
    if (!keys.has(key))
      throw new HttpError(400, 'invalid_request', 'Unknown item');
  for (const [key, id] of Object.entries(selection.picks)) {
    const closest = matched.noMatch.find((gap) => gap.itemKey === key)?.closest
      ?.candidate;
    const candidate =
      interests.find((i) => i.itemKey === key && i.candidate.product.id === id)
        ?.candidate ??
      matched.candidates[key]?.find((c) => c.product.id === id) ??
      (closest?.product.id === id ? closest : undefined);
    if (!candidate)
      throw new HttpError(
        400,
        'invalid_request',
        'Product is not offered for this item',
      );
    picks[key] = candidate;
    if (!matched.candidates[key]?.some((c) => c.product.id === id))
      added.push(key);
  }
  for (const key of selection.dropped) delete picks[key];
  const option = priceBasket(
    { ...input, noMatch: matched.noMatch.filter((gap) => !picks[gap.itemKey]) },
    picks,
    selection.profile,
  );
  if (option.status === 'over_budget') {
    // Compare the same selected needs, allowing cheaper products, without dropping items to hit the budget.
    const minimum = optimize(
      {
        ...input,
        plan: {
          ...plan,
          budget: null,
          items: plan.items.filter((item) => picks[item.key]),
        },
        candidates: Object.fromEntries(
          Object.entries(picks).map(([key, selected]) => [
            key,
            [...(matched.candidates[key] ?? []), selected],
          ]),
        ),
        noMatch: [],
      },
      'saver',
    );
    option.minimumCost = minimum.grandTotal;
    option.costDrivers = [...option.lines]
      .sort((a, b) => b.lineTotal - a.lineTotal)
      .slice(0, 3)
      .map((line) => line.product.title);
    option.overBy = option.grandTotal - plan.budget!;
    option.fit = fitToBudget(input, option, added);
  }
  return option;
}
