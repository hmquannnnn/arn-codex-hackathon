import type { BasketOption, Candidate, Profile } from '@/contract/types';
import type { OptimizerInput } from './types';
import { inventoryConflicts } from './inventory';
import { priceBasket } from './pricing';
import { fitToBudget } from './fit';
export { priceBasket } from './pricing';
export { fitToBudget } from './fit';
export type { OptimizerInput } from './types';

type Picks = Record<string, Candidate>;
interface State {
  picks: Picks;
  option: BasketOption;
  quality: number;
  constraintGaps: number;
}
const profiles: Profile[] = ['saver', 'balanced', 'premium'];
function utility(state: State, profile: Profile) {
  if (profile === 'saver') return -state.option.grandTotal;
  return (
    state.quality -
    (profile === 'balanced' ? (0.5 * state.option.grandTotal) / 1000000 : 0)
  );
}
function better(a: State, b: State | undefined, profile: Profile) {
  if (!b) return true;
  if (a.constraintGaps !== b.constraintGaps)
    return a.constraintGaps < b.constraintGaps;
  const diff = utility(a, profile) - utility(b, profile);
  return (
    diff > 1e-9 ||
    (Math.abs(diff) <= 1e-9 &&
      (profile === 'saver'
        ? a.quality > b.quality
        : a.option.grandTotal < b.option.grandTotal))
  );
}
function search(input: OptimizerInput, keys: string[]) {
  const winners: Partial<Record<Profile, State>> = {};
  function evaluate(picks: Picks): State {
    let pricedInput = input;
    let constraintGaps = 0;
    if (input.plan.shopping) {
      const conflicts = inventoryConflicts(input.plan, picks);
      picks = Object.fromEntries(
        Object.entries(picks).filter(([key]) => !conflicts.includes(key)),
      );
      const missing = keys.filter((key) => !picks[key]);
      constraintGaps = missing.length;
      pricedInput = {
        ...input,
        noMatch: [
          ...(input.noMatch ?? []),
          ...missing.map((key) => ({
            itemKey: key,
            needLabel: `Insufficient saved quantity: ${input.plan.items.find((item) => item.key === key)!.needLabel}`,
            reason: 'no_product_with_tags' as const,
            closest: null,
          })),
        ],
      };
    }
    const option = priceBasket(pricedInput, picks, 'balanced');
    const state = {
      picks,
      constraintGaps,
      option,
      quality: Object.values(picks).reduce((sum, c) => sum + c.score, 0),
    };
    if (better(state, winners.saver, 'saver')) winners.saver = state;
    if (input.plan.budget === null || option.grandTotal <= input.plan.budget) {
      for (const profile of ['balanced', 'premium'] as const)
        if (better(state, winners[profile], profile)) winners[profile] = state;
    }
    return state;
  }
  function visit(index: number, picks: Picks) {
    if (index === keys.length) {
      evaluate(picks);
      return;
    }
    const key = keys[index];
    for (const candidate of input.candidates[key])
      visit(index + 1, { ...picks, [key]: candidate });
  }
  const combinations = keys.reduce(
    (count, key) => count * input.candidates[key].length,
    1,
  );
  if (combinations <= 12000) {
    visit(0, {});
  } else {
    // Full-basket coordinate search preserves exact voucher/shipping prices. Starts
    // at low cost, high quality and common shops escape consolidation local minima.
    const seeds: Picks[] = [
      Object.fromEntries(
        keys.map((key) => [
          key,
          [...input.candidates[key]].sort(
            (a, b) => a.product.price - b.product.price || b.score - a.score,
          )[0],
        ]),
      ),
      Object.fromEntries(
        keys.map((key) => [
          key,
          [...input.candidates[key]].sort(
            (a, b) => b.score - a.score || a.product.price - b.product.price,
          )[0],
        ]),
      ),
    ];
    const shopCoverage = new Map<string, number>();
    for (const key of keys)
      for (const shop of new Set(input.candidates[key].map((c) => c.shop.id)))
        shopCoverage.set(shop, (shopCoverage.get(shop) ?? 0) + 1);
    const commonShops = [...shopCoverage]
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
      .slice(0, 2);
    // A less common shop may need several simultaneous moves before its voucher
    // becomes eligible. Seed those groups explicitly so single-item descent does
    // not mistake a threshold barrier for an unaffordable required basket.
    const voucherShops = input.vouchers
      .filter(
        (v) => v.scope === 'shop' && v.shopId && shopCoverage.has(v.shopId),
      )
      .map((v) => v.shopId!);
    const targetShops = [
      ...new Set([...commonShops.map(([shop]) => shop), ...voucherShops]),
    ];
    for (const shop of targetShops)
      seeds.push(
        Object.fromEntries(
          keys.map((key) => [
            key,
            [...input.candidates[key]].sort(
              (a, b) =>
                Number(b.shop.id === shop) - Number(a.shop.id === shop) ||
                a.product.price - b.product.price ||
                b.score - a.score,
            )[0],
          ]),
        ),
      );
    function improves(a: State, b: State, profile: Profile) {
      const budget = input.plan.budget ?? Infinity;
      const aFits = a.option.grandTotal <= budget;
      const bFits = b.option.grandTotal <= budget;
      if (aFits !== bFits) return aFits;
      return better(a, b, !aFits ? 'saver' : profile);
    }
    for (const profile of profiles) {
      const starts = winners.saver ? [...seeds, winners.saver.picks] : seeds;
      for (const seed of starts) {
        let current = evaluate(seed);
        for (let round = 0; round < 2; round++) {
          let changed = false;
          for (const key of keys) {
            let next = current;
            for (const candidate of input.candidates[key]) {
              if (candidate === current.picks[key]) continue;
              const state = evaluate({ ...current.picks, [key]: candidate });
              if (improves(state, next, profile)) next = state;
            }
            if (next !== current) changed = true;
            current = next;
          }
          if (!changed) break;
        }
      }
    }
  }
  return winners as Record<Profile, State>;
}
export function optimize(
  input: OptimizerInput,
  profile: Profile = 'balanced',
): BasketOption {
  return optimizeProfiles(input, [profile])[0];
}
export function optimizeProfiles(
  input: OptimizerInput,
  requested: Profile[] = profiles,
): BasketOption[] {
  const candidates = Object.fromEntries(
    input.plan.items.map((item) => [
      item.key,
      (input.candidates[item.key] ?? []).filter(
        (candidate) =>
          candidate.product.stock >= item.quantity &&
          (!input.plan.deadline || candidate.arrivesBy <= input.plan.deadline),
      ),
    ]),
  );
  const safeInput = { ...input, candidates };
  let keys = input.plan.items
    .filter((item) => candidates[item.key].length)
    .map((item) => item.key);
  let winners = search(safeInput, keys);
  const optional = input.plan.items
    .filter(
      (item) =>
        !item.required &&
        candidates[item.key].length &&
        !candidates[item.key].some((c) =>
          input.plan.shopping?.keepProductIds.includes(c.product.id),
        ),
    )
    .sort((a, b) => {
      const efficiency = (key: string, quantity: number) =>
        Math.max(
          ...candidates[key].map(
            (c) => c.score / Math.max(1, c.product.price * quantity),
          ),
        );
      return efficiency(a.key, a.quantity) - efficiency(b.key, b.quantity);
    });
  while (
    input.plan.budget !== null &&
    winners.saver.option.grandTotal > input.plan.budget &&
    optional.length
  ) {
    const drop = optional.shift()!;
    keys = keys.filter((key) => key !== drop.key);
    winners = search(safeInput, keys);
  }
  return requested.map((profile) => {
    const option = { ...(winners[profile] ?? winners.saver).option, profile };
    if (option.status === 'over_budget') {
      option.fit = fitToBudget(safeInput, option);
      option.minimumCost = winners.saver.option.grandTotal;
      option.overBy = option.grandTotal - input.plan.budget!;
      option.costDrivers = [...option.lines]
        .sort((a, b) => b.lineTotal - a.lineTotal)
        .slice(0, 3)
        .map((line) => line.product.title);
    }
    return option;
  });
}
