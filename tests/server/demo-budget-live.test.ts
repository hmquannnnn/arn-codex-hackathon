import { expect, it } from 'vitest';
import { planNeed } from '@/server/planner';
import { OpenAILLM } from '@/server/llm';
import { SupabaseAdapter } from '@/server/commerce';
import { matchPlan } from '@/server/matcher';
import { optimize } from '@/server/optimizer';

it.skipIf(process.env.KITLY_TEST_DEMO !== '1')(
  'tiny Grade 1 budget retains essentials and offers an honest minimum and Fit with the real model/catalog',
  async () => {
    const adapter = new SupabaseAdapter();
    const plan = await planNeed(new OpenAILLM(), 'Grade 1, budget 200k');
    expect(plan.budget).toBe(200000);
    expect(plan.items.length).toBeGreaterThanOrEqual(8);
    for (const category of [
      'school-backpack',
      'notebooks',
      'pencils-pens',
      'uniform-shirt',
    ]) {
      expect(
        plan.items.find((item) => item.category === category)?.required,
      ).toBe(true);
    }
    const matched = await matchPlan(plan, adapter);
    const option = optimize({
      plan,
      candidates: matched.candidates,
      noMatch: matched.noMatch,
      vouchers: await adapter.listVouchers('lan'),
    });
    expect(option.status).toBe('over_budget');
    expect(option.minimumCost).toBeGreaterThan(200000);
    expect(option.costDrivers?.length).toBeGreaterThan(0);
    expect(option.fit?.length).toBeGreaterThan(0);
    expect(option.fit?.some((fit) => fit.grandTotal <= 200000)).toBe(true);
  },
  60000,
);
