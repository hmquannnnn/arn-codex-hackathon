import { afterEach, expect, it, vi } from 'vitest';
import { planNeed } from '@/server/planner';
import { FakeLLM } from '@/server/llm';
import type { KitPlan } from '@/contract/types';

function plan(count = 3): KitPlan {
  return {
    event: 'back_to_school',
    language: 'en',
    budget: 1500000,
    deadline: '2026-09-05',
    assumptions: [],
    items: Array.from({ length: count }, (_, index) => ({
      key: `item-${index}`,
      needLabel: index ? 'Pens' : 'Backpack',
      category: index ? 'pencils-pens' : 'school-backpack',
      required: true,
      quantity: 1,
      mustHaveTags: [],
      niceToHaveTags: [],
      maxUnitPrice: index ? null : 400000,
    })),
  };
}
afterEach(() => vi.unstubAllEnvs());
it('normalizes context tags, quantities and old deadlines while prompting item-specific school and pack rules', async () => {
  vi.stubEnv('DEMO_TODAY', '2026-09-02');
  vi.stubEnv('KITLY_MODEL_PLANNER', 'test-planner');
  vi.stubEnv('KITLY_PLANNER_EFFORT', 'high');
  const sloppy = plan();
  sloppy.deadline = '2026-08-20';
  sloppy.items[0].mustHaveTags = ['kids', 'grade-1', 'anti-hunchback'];
  sloppy.items[0].quantity = 5;
  sloppy.items[1].mustHaveTags = ['kids', 'grade-1'];
  sloppy.items[1].quantity = 0;
  sloppy.items[2].quantity = 4;
  const fake = new FakeLLM([sloppy]);
  const result = await planNeed(
    fake,
    'My kid starts Grade 1. Budget 1.5M VND. The backpack must be anti-hunchback, under 400k.',
  );
  expect(result.items.map((item) => item.mustHaveTags)).toEqual([
    ['anti-hunchback'],
    [],
    [],
  ]);
  expect(result.items[0].niceToHaveTags).toEqual(['kids', 'grade-1']);
  expect(result.items.map((item) => item.quantity)).toEqual([3, 1, 3]);
  expect(result.deadline).toBeNull();
  expect(fake.calls).toHaveLength(1);
  expect(fake.calls[0]).toMatchObject({
    model: 'test-planner',
    effort: 'high',
  });
  const prompt = fake.calls[0].messages[0].content;
  for (const required of [
    '2026-09-02',
    'Sep 5',
    'VND',
    'set/pack',
    'quantity 1',
    'exact item',
    'Vietnamese input',
    '5–10',
    'tet_gifts',
    '5–8',
  ])
    expect(prompt).toContain(required);
});
it('retries invalid structured output once and propagates the second network failure', async () => {
  const recovered = new FakeLLM([{}, plan()]);
  expect(
    (await planNeed(recovered, 'School kit, budget 1.5M')).items,
  ).toHaveLength(3);
  expect(recovered.calls).toHaveLength(2);
  const failed = new FakeLLM([
    new Error('first network failure'),
    new Error('second network failure'),
  ]);
  await expect(planNeed(failed, 'School kit')).rejects.toThrow(
    'second network failure',
  );
  expect(failed.calls).toHaveLength(2);
});
it('asks once for a fuller sparse plan, keeps the fuller result and preserves a valid sparse fallback', async () => {
  const empty = plan(0);
  empty.event = 'other';
  const puppy = plan(9);
  puppy.event = 'other';
  puppy.items.forEach((item) => {
    item.category = null;
  });
  const fuller = new FakeLLM([empty, puppy]);
  expect((await planNeed(fuller, 'I am adopting a puppy')).items).toHaveLength(
    9,
  );
  expect(fuller.calls).toHaveLength(2);
  expect(
    fuller.calls[1].messages.some((message) =>
      /full kit/i.test(message.content),
    ),
  ).toBe(true);
  const sparser = new FakeLLM([plan(1), plan(0)]);
  expect((await planNeed(sparser, 'School kit')).items).toHaveLength(1);
  expect(sparser.calls).toHaveLength(2);
  const failedExpansion = new FakeLLM([
    plan(1),
    new Error('offline'),
    new Error('still offline'),
  ]);
  expect((await planNeed(failedExpansion, 'School kit')).items).toHaveLength(1);
});
it.each([
  {
    language: 'vi' as const,
    date: '2026-09-05',
    assumptions: ['Cho một bé', 'Hạn nhận trước khai giảng 5/9'],
    expected: ['Trước 5/9 (khai giảng)', 'Cho một bé'],
  },
  {
    language: 'en' as const,
    date: '2026-09-05',
    assumptions: ['For one child'],
    expected: ['By Sep 5 (school opening)', 'For one child'],
  },
  {
    language: 'en' as const,
    date: '2026-09-04',
    assumptions: [
      'By Sep 5 (school opening)',
      'school starts September 5',
      'For one child',
    ],
    expected: ['For one child'],
  },
])(
  'canonicalizes school-opening chips for $language with deadline $date',
  async ({ language, date, assumptions, expected }) => {
    vi.stubEnv('DEMO_TODAY', '2026-09-02');
    const raw = { ...plan(), language, deadline: date, assumptions };
    const result = await planNeed(new FakeLLM([raw]), 'School kit');
    expect(result.assumptions).toEqual(expected);
  },
);
it.each(['not-a-date', '2026-09-31', '2026-2-03', '2026-08-31'])(
  'turns invalid or past deadline %s into null',
  async (deadline) => {
    vi.stubEnv('DEMO_TODAY', '2026-09-02');
    const raw = { ...plan(), deadline };
    expect(
      (await planNeed(new FakeLLM([raw]), 'School kit')).deadline,
    ).toBeNull();
  },
);
it.each(['category', 'tag'] as const)(
  'rejects a noncanonical %s and retries through the strict planning schema',
  async (kind) => {
    const invalid = plan();
    if (kind === 'category') invalid.items[0].category = 'unlisted-category';
    else invalid.items[0].mustHaveTags = ['invented-tag'];
    const fake = new FakeLLM([invalid, plan()]);
    expect((await planNeed(fake, 'School kit')).items[0].category).toBe(
      'school-backpack',
    );
    expect(fake.calls).toHaveLength(2);
  },
);
it('uses next year school opening once this year opening has passed', async () => {
  vi.stubEnv('DEMO_TODAY', '2026-09-06');
  const raw = {
    ...plan(),
    deadline: '2027-09-05',
    assumptions: ['school starts September 5'],
  };
  expect(
    (await planNeed(new FakeLLM([raw]), 'School kit')).assumptions,
  ).toEqual(['By Sep 5 (school opening)']);
});
