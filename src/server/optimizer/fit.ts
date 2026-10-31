import type { BasketOption, Candidate, FitSuggestion } from '@/contract/types';
import type { OptimizerInput } from './types';
import { priceBasket } from './pricing';
import { today } from '@/server/today';

/** Rebuild selected candidates from the actual basket, including Add-anyway products outside the pool. */
function selectedCandidates(input: OptimizerInput, option: BasketOption) {
  return Object.fromEntries(
    option.lines.map((line) => {
      const existing = input.candidates[line.itemKey]?.find(
        (c) => c.product.id === line.product.id,
      );
      const arrives = new Date(`${today()}T00:00:00.000Z`);
      arrives.setUTCDate(arrives.getUTCDate() + line.product.shipDaysMax);
      const candidate: Candidate = existing ?? {
        product: line.product,
        shop: line.shop,
        score: 0,
        matchedTags: [],
        arrivesBy: arrives.toISOString().slice(0, 10),
      };
      return [line.itemKey, candidate];
    }),
  );
}

export function fitToBudget(
  input: OptimizerInput,
  option: BasketOption,
  addedAnywayKeys: string[] = [],
): FitSuggestion[] {
  const budget = input.plan.budget ?? Infinity;
  if (option.grandTotal <= budget) return [];
  const picks = selectedCandidates(input, option);
  const removed: string[] = [];
  const swaps = new Map<string, string>();
  const names = new Map(
    input.plan.items.map((item) => [item.key, item.needLabel]),
  );
  const vi = input.plan.language === 'vi';
  function suggestion(): FitSuggestion[] | null {
    const priced = priceBasket(input, picks, option.profile);
    if (priced.grandTotal > budget) return null;
    const moves: string[] = [];
    if (removed.length)
      moves.push(
        `${vi ? 'Bỏ' : 'Drop'} ${removed.map((key) => names.get(key) ?? key).join(', ')}`,
      );
    for (const [key] of swaps)
      moves.push(
        `${vi ? 'đổi' : 'switch'} ${names.get(key) ?? key} ${vi ? 'sang' : 'to'} ${picks[key].product.title}`,
      );
    return [
      {
        id: 'fit-1',
        label: `${moves.join(', ')}: ${new Intl.NumberFormat('vi-VN').format(priced.grandTotal)}₫`,
        removeItemKeys: [...removed],
        swaps: [...swaps].map(([itemKey, productId]) => ({
          itemKey,
          productId,
        })),
        grandTotal: priced.grandTotal,
        fits: true,
        dropsMustHave: removed.some((key) =>
          input.plan.items.some((item) => item.key === key && item.required),
        ),
      },
    ];
  }
  function drop(key: string) {
    delete picks[key];
    swaps.delete(key);
    removed.push(key);
    return suggestion();
  }
  for (const key of addedAnywayKeys) {
    if (!picks[key]) continue;
    const result = drop(key);
    if (result) return result;
  }
  const optional = input.plan.items
    .filter((item) => !item.required && picks[item.key])
    .sort(
      (a, b) =>
        picks[a.key].score /
          Math.max(1, picks[a.key].product.price * a.quantity) -
        picks[b.key].score /
          Math.max(1, picks[b.key].product.price * b.quantity),
    );
  for (const item of optional) {
    const result = drop(item.key);
    if (result) return result;
  }
  // A single cheaper swap can raise shipping or lose a voucher. Search combinations
  // before removing a required need; every complete state is repriced exactly.
  const keys = Object.keys(picks);
  const choices = keys.map((key) => {
    const original = picks[key];
    const alternatives = [
      ...(input.candidates[key] ?? []),
      ...(option.lines.find((line) => line.itemKey === key)?.alternatives ??
        []),
    ];
    const unique = new Map([[original.product.id, original]]);
    for (const candidate of alternatives) {
      if (
                candidate.product.stock >=
          (input.plan.items.find((item) => item.key === key)?.quantity ?? 1) &&
        (input.plan.deadline === null ||
          candidate.arrivesBy <= input.plan.deadline)
      ) {
        unique.set(candidate.product.id, candidate);
      }
    }
    return [...unique.values()].sort(
      (a, b) => a.product.price - b.product.price || b.score - a.score,
    );
  });
  let bestPicks = { ...picks };
  let bestTotal = priceBasket(input, bestPicks, option.profile).grandTotal;
  const combinations = choices.reduce(
    (count, values) => count * values.length,
    1,
  );
  if (combinations <= 4096) {
    const state = { ...picks };
    function visit(index: number) {
      if (index === keys.length) {
        const total = priceBasket(input, state, option.profile).grandTotal;
        if (total < bestTotal) {
          bestTotal = total;
          bestPicks = { ...state };
        }
        return;
      }
      for (const candidate of choices[index]) {
        state[keys[index]] = candidate;
        visit(index + 1);
      }
    }
    visit(0);
  } else {
    let beam = [{ picks: { ...picks }, total: bestTotal }];
    for (const [index, key] of keys.entries()) {
      beam = beam
        .flatMap((state) =>
          choices[index].map((candidate) => {
            const next = { ...state.picks, [key]: candidate };
            return {
              picks: next,
              total: priceBasket(input, next, option.profile).grandTotal,
            };
          }),
        )
        .sort((a, b) => a.total - b.total)
        .slice(0, 64);
    }
    if (beam[0] && beam[0].total < bestTotal) bestPicks = beam[0].picks;
  }
  for (const key of keys) {
    if (bestPicks[key].product.id !== picks[key].product.id)
      swaps.set(key, bestPicks[key].product.id);
    picks[key] = bestPicks[key];
  }
  const swapped = suggestion();
  if (swapped) return swapped;
  const required = input.plan.items
    .filter((item) => item.required && picks[item.key])
    .sort(
      (a, b) =>
        picks[b.key].product.price * b.quantity -
        picks[a.key].product.price * a.quantity,
    );
  for (const item of required) {
    const result = drop(item.key);
    if (result) return result;
  }
  return [];
}
