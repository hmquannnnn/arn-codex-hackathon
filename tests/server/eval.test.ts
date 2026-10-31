import { afterEach, expect, it, vi } from 'vitest';
import { FakeLLM } from '@/server/llm';
import { categories } from '@/contract/taxonomy';
import type { EventType, KitPlan } from '@/contract/types';
import { runEvaluation } from '../../scripts/eval';
const events: EventType[] = [
  'back_to_school',
  'newborn',
  'first_apartment',
  'camping_trip',
  'home_office',
  'tet_gifts',
];
function plan(event: EventType): KitPlan {
  return {
    event,
    language: 'en',
    budget: 1500000,
    deadline: '2026-09-05',
    assumptions: [],
    items: Array.from({ length: 5 }, (_, i) => ({
      key: 'item' + i,
      needLabel: 'Item ' + i,
      category:
        event === 'other'
          ? null
          : categories.find((c) => c.event === event)!.id,
      required: true,
      quantity: 1,
      mustHaveTags: [],
      niceToHaveTags: [],
      maxUnitPrice: null,
    })),
  };
}
function outputs() {
  return [
    ...events.map(plan),
    ...Array.from({ length: 3 }, () => plan('other')),
    plan('back_to_school'),
    plan('back_to_school'),
    { ...plan('back_to_school'), deadline: '2026-09-04', intent: 'change_kit' },
    { ...plan('back_to_school'), intent: 'answer' },
  ];
}
afterEach(() => vi.unstubAllEnvs());
it('S8 runs all13 cases through the real planner seam and reports pass/fail and latency', async () => {
  vi.stubEnv('DEMO_TODAY', '2026-09-02');
  const llm = new FakeLLM(outputs());
  const result = await runEvaluation(llm);
  expect(result.passed).toBe(true);
  expect(result.rows).toHaveLength(13);
  expect(result.rows.every((r) => r.pass && r.latencyMs >= 0)).toBe(true);
  expect(llm.calls).toHaveLength(13);
  expect(
    llm.calls.filter((c) =>
      c.messages[0].content.includes('refining an existing kit'),
    ),
  ).toHaveLength(2);
});
it('S8 fails wrong event categories, sparse plans, off-coverage misclassification, school date and refine intents without stopping the table', async () => {
  vi.stubEnv('DEMO_TODAY', '2026-09-02');
  const cases = outputs();
  cases[0] = plan('newborn');
  cases[1] = { ...plan('newborn'), items: plan('newborn').items.slice(0, 4) };
  cases[6] = plan('back_to_school');
  cases[9] = { ...plan('back_to_school'), deadline: '2026-09-06' };
  cases[11] = {
    ...plan('back_to_school'),
    deadline: '2026-09-05',
    intent: 'answer',
  };
  cases[12] = { ...plan('back_to_school'), intent: 'change_kit' };
  const result = await runEvaluation(new FakeLLM(cases));
  expect(result.passed).toBe(false);
  expect(result.rows).toHaveLength(13);
  expect(result.rows.filter((r) => !r.pass).map((r) => r.id)).toEqual([
    'school',
    'newborn',
    'puppy',
    'hero-vi',
    'express',
    'answer',
  ]);
});
