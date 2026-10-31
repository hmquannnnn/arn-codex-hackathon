import { pathToFileURL } from 'node:url';
import nextEnv from '@next/env';
import type { EventType, KitPlan } from '../src/contract/types';
import { categories } from '../src/contract/taxonomy';
import { planNeed, refineNeed } from '../src/server/planner';
import { OpenAILLM } from '../src/server/llm/client';
import type { LLM } from '../src/server/llm/types';
interface EvalCase {
  id: string;
  query: string;
  event: EventType;
  deadline?: string;
  intent?: 'change_kit' | 'answer';
}
const cases: EvalCase[] = [
  {
    id: 'school',
    query: 'My kid starts Grade 1. Budget 1.5M VND.',
    event: 'back_to_school',
  },
  {
    id: 'newborn',
    query: 'Chuẩn bị đón em bé sơ sinh, ngân sách 3 triệu.',
    event: 'newborn',
  },
  {
    id: 'apartment',
    query: 'Moving into my first apartment. Budget 5M VND.',
    event: 'first_apartment',
  },
  {
    id: 'camping',
    query: 'Đi cắm trại cuối tuần cho 2 người, ngân sách 3 triệu.',
    event: 'camping_trip',
  },
  {
    id: 'office',
    query: 'Set up a home office, budget 5M VND.',
    event: 'home_office',
  },
  {
    id: 'tet',
    query: 'Mua quà Tết cho gia đình, ngân sách 3 triệu.',
    event: 'tet_gifts',
  },
  { id: 'puppy', query: 'Adopting a puppy, budget 2M VND.', event: 'other' },
  {
    id: 'wedding',
    query: 'Planning a wedding, budget 20M VND.',
    event: 'other',
  },
  { id: 'guitar', query: 'Learning guitar, budget 3M VND.', event: 'other' },
  {
    id: 'hero-vi',
    query:
      'Con tôi chuẩn bị vào lớp 1, ngân sách 1,5 triệu. Balo phải chống gù, dưới 400k.',
    event: 'back_to_school',
    deadline: '2026-09-05',
  },
  {
    id: 'hero-en',
    query:
      'My kid starts Grade 1. Budget 1.5M VND. The backpack must be anti-hunchback, under 400k.',
    event: 'back_to_school',
    deadline: '2026-09-05',
  },
  {
    id: 'express',
    query: 'Ship hoả tốc giúp tôi',
    event: 'back_to_school',
    deadline: '2026-09-04',
    intent: 'change_kit',
  },
  {
    id: 'answer',
    query: 'Balo Minh An có chống gù thật không?',
    event: 'back_to_school',
    intent: 'answer',
  },
];
export interface EvalRow {
  id: string;
  pass: boolean;
  latencyMs: number;
  items: number;
  categoryPercent: number;
  checks: string;
}
/** Exercises the public planner, never catalog/DB writes; callers receive the same table as the CLI. */
export async function runEvaluation(llm: LLM, onRow?: (row: EvalRow) => void) {
  const rows: EvalRow[] = [];
  let hero: KitPlan | undefined;
  for (const test of cases) {
    const start = performance.now();
    let row: EvalRow;
    try {
      let plan: KitPlan, intent: string | undefined;
      if (test.intent) {
        if (!hero) throw Error('Missing hero plan');
        ({ plan, intent } = await refineNeed(llm, hero, test.query, []));
      } else plan = await planNeed(llm, test.query);
      if (test.id === 'hero-vi' || test.id === 'hero-en') hero = plan;
      const correct = plan.items.filter((item) =>
        test.event === 'other'
          ? item.category === null
          : categories.some(
              (c) => c.id === item.category && c.event === test.event,
            ),
      ).length;
      const ratio = plan.items.length ? correct / plan.items.length : 0;
      // Every named taxonomy category belongs to a covered event, so off-coverage plans may not masquerade as one.
      const wrongCategories =
        test.event === 'other' &&
        plan.items.some((item) => item.category !== null);
      const failures = [
        ...(plan.items.length < 5 ? ['fewer than5 items'] : []),
        ...(plan.event !== test.event ? ['wrong event'] : []),
        ...(ratio < (test.event === 'other' ? 0.5 : 0.7)
          ? ['category coverage']
          : []),
        ...(wrongCategories ? ['wrong-event category'] : []),
        ...(test.deadline && plan.deadline !== test.deadline
          ? ['deadline']
          : []),
        ...(test.intent && intent !== test.intent ? ['intent'] : []),
      ];
      row = {
        id: test.id,
        pass: !failures.length,
        latencyMs: Math.round(performance.now() - start),
        items: plan.items.length,
        categoryPercent: Math.round(ratio * 100),
        checks: failures.join(', ') || 'OK',
      };
    } catch {
      row = {
        id: test.id,
        pass: false,
        latencyMs: Math.round(performance.now() - start),
        items: 0,
        categoryPercent: 0,
        checks: 'Planner call failed',
      };
    }
    rows.push(row);
    onRow?.(row);
  }
  return { passed: rows.every((r) => r.pass), rows };
}
async function main() {
  nextEnv.loadEnvConfig(process.cwd());
  process.env.DEMO_TODAY = '2026-09-02';
  console.log(
    'Planner evaluation: DEMO_TODAY=2026-09-02; real model, no DB writes',
  );
  const result = await runEvaluation(new OpenAILLM(), (row) =>
    console.log(
      `${row.pass ? 'PASS' : 'FAIL'} ${row.id}: ${row.latencyMs}ms, ${row.items}items, ${row.categoryPercent}% categories — ${row.checks}`,
    ),
  );
  console.table(
    result.rows.map((r) => ({
      case: r.id,
      result: r.pass ? 'PASS' : 'FAIL',
      latencyMs: r.latencyMs,
      items: r.items,
      categoryPercent: r.categoryPercent,
      checks: r.checks,
    })),
  );
  console.log(
    `${result.rows.filter((r) => r.pass).length}/${result.rows.length} passed`,
  );
  if (!result.passed) process.exitCode = 1;
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href)
  main().catch(() => {
    console.error('Evaluation failed; check model configuration.');
    process.exitCode = 1;
  });
