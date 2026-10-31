import { afterEach, expect, it, vi } from 'vitest';
import { runKit, type PipelineDeps } from '@/server/pipeline';
import { InMemoryAdapter } from '@/server/commerce';
import { InMemoryKitStore } from '@/server/kits';
import { FakeLLM } from '@/server/llm';
import { kitEventSchema, kitPlanSchema } from '@/contract/schemas';
import type { KitEvent } from '@/contract/types';
import threads from '@/contract/fixtures/threads.sample.json';
const plan = () => kitPlanSchema.parse(threads[0].versions[0].plan);
afterEach(() => vi.unstubAllEnvs());
async function collect(deps: PipelineDeps, query = 'Grade 1 budget 1.5M') {
  const events: KitEvent[] = [];
  for await (const event of runKit(
    { query, owner: 'alice', persona: 'lan' },
    deps,
  ))
    events.push(kitEventSchema.parse(event));
  return events;
}
it('streams validated options before explanation and saves one owned version and one demand row per item', async () => {
  vi.stubEnv('DEMO_TODAY', '2026-09-02');
  const parsed = plan();
  const deps = {
    adapter: new InMemoryAdapter(),
    store: new InMemoryKitStore(),
    llm: new FakeLLM([parsed], ['Your kit ', 'is ready.']),
  };
  const events = await collect(deps);
  const major = events
    .filter((event) => event.event !== 'step')
    .map((event) => event.event);
  expect(major).toEqual([
    'plan',
    'options',
    'explanation',
    'explanation',
    'done',
  ]);
  const planEvent = events.find((event) => event.event === 'plan');
  if (planEvent?.event !== 'plan') throw new Error('No plan');
  const { threadId, sessionId } = planEvent.data;
  const stored = await deps.store.getThread(threadId, 'alice');
  expect(stored?.versions).toHaveLength(1);
  expect(stored?.versions[0]).toMatchObject({
    version: 1,
    status: 'ready',
    explanation: 'Your kit is ready.',
    followUp: null,
    diff: null,
    selection: null,
  });
  expect(stored?.versions[0].options.map((option) => option.profile)).toEqual([
    'saver',
    'balanced',
    'premium',
  ]);
  expect(await deps.store.getThread(threadId, 'bob')).toBeNull();
  const demand = (await deps.adapter.demandItemsSince('2026-09-02')).filter(
    (row) => row.sessionId === sessionId,
  );
  expect(demand).toHaveLength(parsed.items.length);
  expect(new Set(demand.map((row) => row.needLabel)).size).toBe(
    parsed.items.length,
  );
  expect(
    events.flatMap((event) =>
      event.event === 'step' && event.data.status === 'done'
        ? [event.data.id]
        : [],
    ),
  ).toEqual(['understand', 'plan', 'search', 'optimize', 'explain']);
  expect(events.at(-1)).toMatchObject({
    event: 'done',
    data: { threadId, sessionId, version: 1 },
  });
});
it('saves awaiting-budget version and localized clarify without searches or explanation demand', async () => {
  vi.stubEnv('DEMO_TODAY', '2026-09-02');
  const parsed = { ...plan(), budget: null, language: 'vi' as const };
  const deps = {
    adapter: new InMemoryAdapter(),
    store: new InMemoryKitStore(),
    llm: new FakeLLM([parsed]),
  };
  const events = await collect(deps);
  expect(
    events
      .filter((event) => event.event !== 'step')
      .map((event) => event.event),
  ).toEqual(['plan', 'clarify', 'done']);
  const clarify = events.find((event) => event.event === 'clarify');
  expect(clarify).toMatchObject({
    data: {
      question: { kind: 'budget', choices: [500000, 1000000, 2000000, null] },
    },
  });
  expect(JSON.stringify(clarify)).toContain('ngân sách');
  const done = events.at(-1);
  if (done?.event !== 'done') throw new Error('No done');
  const stored = await deps.store.getThread(done.data.threadId, 'alice');
  expect(stored?.versions[0]).toMatchObject({
    status: 'awaiting_budget',
    options: [],
    explanation: '',
    followUp: null,
  });
  expect(
    (await deps.adapter.demandItemsSince('2026-09-02')).filter(
      (row) => row.sessionId === done.data.sessionId,
    ),
  ).toEqual([]);
  expect(deps.llm.calls.map((call) => call.kind)).toEqual(['structured']);
  expect(
    events.some(
      (event) =>
        event.event === 'step' &&
        ['search', 'optimize', 'explain'].includes(event.data.id),
    ),
  ).toBe(false);
});
it('emits one terminal generic error after both planner attempts fail', async () => {
  const deps = {
    adapter: new InMemoryAdapter(),
    store: new InMemoryKitStore(),
    llm: new FakeLLM([
      new Error('private upstream key'),
      new Error('private upstream key'),
    ]),
  };
  const events = await collect(deps);
  expect(events.at(-1)).toEqual({
    event: 'error',
    data: {
      code: 'llm_error',
      message: 'Unable to build your kit. Please try again.',
    },
  });
  expect(events.filter((event) => event.event === 'error')).toHaveLength(1);
  expect(events.some((event) => event.event === 'done')).toBe(false);
  expect(JSON.stringify(events)).not.toContain('private');
  expect(deps.llm.calls).toHaveLength(2);
});
it('keeps a ready basket and persists partial explanation when the explainer fails', async () => {
  const deps = {
    adapter: new InMemoryAdapter(),
    store: new InMemoryKitStore(),
    llm: new FakeLLM(
      [plan()],
      ['Partial ', new Error('private stream failure')],
    ),
  };
  const events = await collect(deps);
  expect(events.filter((event) => event.event === 'error')).toEqual([]);
  expect(events).toContainEqual({
    event: 'step',
    data: { id: 'explain', status: 'done', detail: 'Explanation unavailable' },
  });
  const done = events.at(-1);
  if (done?.event !== 'done') throw new Error('No done');
  const stored = await deps.store.getThread(done.data.threadId, 'alice');
  expect(stored?.versions[0]).toMatchObject({
    status: 'ready',
    explanation: 'Partial ',
  });
  expect(stored?.versions[0].options).toHaveLength(3);
  expect(JSON.stringify(events)).not.toContain('private');
});
it('records zero matches for every uncovered puppy need and retries one invalid planner output', async () => {
  const puppy = {
    ...plan(),
    event: 'other',
    items: plan()
      .items.slice(0, 3)
      .map((item, i) => ({
        ...item,
        key: `puppy-${i}`,
        needLabel: ['Dog food', 'Dog bed', 'Dog leash'][i],
        category: null,
      })),
  };
  const deps = {
    adapter: new InMemoryAdapter(),
    store: new InMemoryKitStore(),
    llm: new FakeLLM(
      [new Error('transient'), puppy],
      ['No pet products are in the catalog.'],
    ),
  };
  const events = await collect(deps, 'Adopting a puppy, budget1M');
  const options = events.find((event) => event.event === 'options');
  if (options?.event !== 'options') throw new Error('No options');
  expect(
    options.data.options.every(
      (option) => option.lines.length === 0 && option.noMatch.length === 3,
    ),
  ).toBe(true);
  expect(
    options.data.options[0].noMatch.every(
      (gap) => gap.reason === 'no_category',
    ),
  ).toBe(true);
  const done = events.at(-1);
  if (done?.event !== 'done') throw new Error('No done');
  const rows = (await deps.adapter.demandItemsSince('2026-09-02')).filter(
    (row) => row.sessionId === done.data.sessionId,
  );
  expect(rows).toHaveLength(3);
  expect(
    rows.every((row) => row.category === null && row.matchedCount === 0),
  ).toBe(true);
  expect(
    deps.llm.calls.filter((call) => call.kind === 'structured'),
  ).toHaveLength(2);
});
it('yields options before starting the explainer and persists before the done event', async () => {
  const deps = {
    adapter: new InMemoryAdapter(),
    store: new InMemoryKitStore(),
    llm: new FakeLLM([plan()], ['Ready.']),
  };
  for await (const event of runKit(
    {
      query: 'School kit 1.5M',
      owner: 'alice',
      persona: 'guest',
      profiles: ['balanced'],
    },
    deps,
  )) {
    kitEventSchema.parse(event);
    if (event.event === 'options') {
      expect(event.data.options.map((option) => option.profile)).toEqual([
        'balanced',
      ]);
      expect(
        deps.llm.calls.filter((call) => call.kind === 'stream'),
      ).toHaveLength(0);
    }
    if (event.event === 'done') {
      expect(
        (await deps.store.getThread(event.data.threadId, 'alice'))?.versions,
      ).toHaveLength(1);
      expect(
        (await deps.store.getThread(event.data.threadId, 'alice'))?.versions[0]
          .explanation,
      ).toBe('Ready.');
    }
  }
});
