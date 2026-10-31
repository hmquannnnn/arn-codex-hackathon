import { describe, expect, it } from 'vitest';
import { optimizeProfiles } from '@/server/optimizer';
import type { OptimizerInput } from '@/server/optimizer/types';
import type { Candidate, PlanItem } from '@/contract/types';
import products from '@/contract/fixtures/products.json';
import shops from '@/contract/fixtures/shops.json';
import vouchers from '@/contract/fixtures/vouchers.json';
import { productSchema, voucherSchema } from '@/contract/schemas';

function offer(
  id: string,
  price: number,
  score: number,
  shopIndex: number,
): Candidate {
  const shop = {
    ...shops[shopIndex],
    tier: 'regular' as const,
    shipFee: shopIndex === 0 ? 15000 : 25000,
  };
  return {
    product: productSchema.parse({
      ...products[0],
      id,
      shopId: shop.id,
      price,
      stock: 100,
    }),
    shop,
    score,
    matchedTags: [],
    arrivesBy: '2026-09-04',
  };
}
function need(key: string, quantity = 1): PlanItem {
  return {
    key,
    needLabel: key,
    category: 'school-backpack',
    required: true,
    quantity,
    mustHaveTags: [],
    niceToHaveTags: [],
    maxUnitPrice: null,
  };
}
function world(
  items: PlanItem[],
  candidates: Record<string, Candidate[]>,
  budget: number,
): OptimizerInput {
  return {
    plan: {
      event: 'back_to_school',
      language: 'en',
      budget,
      deadline: '2026-09-05',
      items,
      assumptions: [],
    },
    candidates,
    vouchers: [],
  };
}

// Independent oracle: enumerate tiny voucher-free retail choices, where the cost is
// merchandise + each distinct seller's posted delivery fee. Never invoke pricing code.
function retailChoices(
  input: OptimizerInput,
): { cost: number; quality: number }[] {
  let choices: Candidate[][] = [[]];
  for (const item of input.plan.items)
    choices = choices.flatMap((chosen) =>
      input.candidates[item.key].map((candidate) => [...chosen, candidate]),
    );
  return choices.map((chosen) => ({
    cost:
      chosen.reduce(
        (sum, candidate, index) =>
          sum + candidate.product.price * input.plan.items[index].quantity,
        0,
      ) +
      [...new Set(chosen.map((candidate) => candidate.shop.id))].reduce(
        (sum, id) =>
          sum +
          chosen.find((candidate) => candidate.shop.id === id)!.shop.shipFee,
        0,
      ),
    quality: chosen.reduce((sum, candidate) => sum + candidate.score, 0),
  }));
}

describe('S1 independent small-world oracle', () => {
  it('selects global lowest cost and global best feasible quality across deterministic random retail worlds', () => {
    let state = 21983;
    const random = (max: number) => {
      state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
      return state % max;
    };
    for (let sample = 0; sample < 45; sample++) {
      const items = Array.from({ length: 2 + random(3) }, (_, i) =>
        need(`need-${i}`, 1 + random(2)),
      );
      const candidates = Object.fromEntries(
        items.map((item) => [
          item.key,
          Array.from({ length: 2 + random(2) }, (_, i) =>
            offer(
              `${item.key}-${i}`,
              25000 + random(40) * 5000,
              0.25 + random(70) / 100,
              random(2),
            ),
          ),
        ]),
      );
      const input = world(items, candidates, 1000000);
      const possible = retailChoices(input);
      const minimum = Math.min(...possible.map((choice) => choice.cost));
      input.plan.budget = minimum + random(15) * 10000;
      const feasible = possible.filter(
        (choice) => choice.cost <= input.plan.budget!,
      );
      const bestQuality = Math.max(...feasible.map((choice) => choice.quality));
      const before = structuredClone(input);
      const options = optimizeProfiles(input);
      expect(input).toEqual(before);
      const saver = options.find((option) => option.profile === 'saver')!;
      const premium = options.find((option) => option.profile === 'premium')!;
      expect(saver.grandTotal, `world ${sample} minimum`).toBe(minimum);
      const premiumQuality = premium.lines.reduce(
        (sum, line) =>
          sum +
          input.candidates[line.itemKey].find(
            (candidate) => candidate.product.id === line.product.id,
          )!.score,
        0,
      );
      expect(premiumQuality, `world ${sample} quality`).toBeCloseTo(
        bestQuality,
        10,
      );
      expect(saver.grandTotal).toBeLessThanOrEqual(premium.grandTotal);
      for (const option of options) {
        expect(option.status, `world ${sample}`).toBe('ok');
        expect(option.grandTotal).toBeLessThanOrEqual(input.plan.budget!);
        expect(option.lines.map((line) => line.itemKey).sort()).toEqual(
          items.map((item) => item.key).sort(),
        );
        expect(option.grandTotal).toBe(
          option.itemsTotal + option.shippingTotal - option.discountTotal,
        );
        expect(option.shops.reduce((sum, shop) => sum + shop.subtotal, 0)).toBe(
          option.itemsTotal,
        );
        expect(option.shops.reduce((sum, shop) => sum + shop.shipping, 0)).toBe(
          option.shippingTotal,
        );
        expect(option.savings).toEqual([]);
        expect(option.discountTotal).toBe(0);
      }
    }
  });

  it('treats wallet savings as actual competing deductions and never invents savings without vouchers', () => {
    const input = world(
      [need('supplies')],
      { supplies: [offer('school-supplies', 600000, 0.8, 0)] },
      1000000,
    );
    const applicable = voucherSchema
      .array()
      .parse(vouchers)
      .filter((v) => ['SAVE5', 'LAN-BTS10'].includes(v.code))
      .map((v) => ({ ...v, validUntil: '2099-12-31' }));
    for (const language of ['en', 'vi'] as const) {
      input.plan.language = language;
      input.vouchers = applicable;
      const wallet = optimizeProfiles(input);
      input.vouchers = applicable.filter((v) => v.ownerPersona === null);
      const guest = optimizeProfiles(input);
      input.vouchers = [];
      const none = optimizeProfiles(input);
      for (let i = 0; i < wallet.length; i++) {
        expect(wallet[i].grandTotal).toBe(555000);
        expect(guest[i].grandTotal).toBe(585000);
        expect(none[i].grandTotal).toBe(615000);
        expect(wallet[i].savings).toEqual([
          {
            label:
              language === 'en'
                ? 'Your wallet voucher Back-to-school 10%'
                : 'Voucher trong ví của bạn Back-to-school 10%',
            amount: 60000,
            wallet: true,
          },
        ]);
        expect(
          wallet[i].savings.reduce((sum, saving) => sum + saving.amount, 0),
        ).toBe(wallet[i].discountTotal);
        expect(none[i].savings).toEqual([]);
      }
    }
  });
});
