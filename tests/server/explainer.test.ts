import { afterEach, expect, it, vi } from 'vitest';
import { explainKit } from '@/server/explainer';
import { FakeLLM } from '@/server/llm/fake';
import { basketOptionSchema, kitPlanSchema } from '@/contract/schemas';
import fixture from '@/contract/fixtures/kit.sample.json';

const plan = kitPlanSchema.parse(
  fixture.find((e) => e.event === 'plan')!.data.plan,
);
const options = basketOptionSchema
  .array()
  .parse(fixture.find((e) => e.event === 'options')!.data.options);
afterEach(() => vi.unstubAllEnvs());
it('streams a short language-aware explanation grounded in actual totals, savings and honest closest facts', async () => {
  vi.stubEnv('KITLY_MODEL_FAST', 'test-fast');
  vi.stubEnv('KITLY_FAST_EFFORT', 'low');
  const llm = new FakeLLM([], ['Giỏ hàng ', 'phù hợp ngân sách.']);
  let text = '';
  for await (const chunk of explainKit(
    llm,
    { ...plan, language: 'vi' },
    options,
  ))
    text += chunk;
  expect(text).toBe('Giỏ hàng phù hợp ngân sách.');
  expect(llm.calls).toHaveLength(1);
  expect(llm.calls[0]).toMatchObject({
    kind: 'stream',
    model: 'test-fast',
    effort: 'low',
  });
  const system = llm.calls[0].messages.find(
    (m) => m.role === 'system',
  )!.content;
  for (const rule of [
    '70 words',
    '4 sentences',
    'about 50 words',
    '3 sentences',
    'do not list the items',
  ])
    expect(system).toContain(rule);
  expect(system).toContain('Vietnamese');
  const facts = llm.calls[0].messages.find((m) => m.role === 'user')!.content;
  expect(facts).toContain('Minh An Kids Backpack New Model 2026');
  expect(facts).toContain('anti-hunchback');
  expect(facts).toContain(
    String(options.find((o) => o.profile === 'balanced')!.grandTotal),
  );
});
it('grounds a refinement explanation in the item diff and instructs it to lead with changes and new total', async () => {
  const llm = new FakeLLM([], ['Removed uniform. New total is lower.']);
  const diff = { added: [], removed: ['uniform'], changed: ['backpack'] };
  for await (const _chunk of explainKit(llm, plan, options, diff)) {
    void _chunk;
  }
  const system = llm.calls[0].messages.find(
    (message) => message.role === 'system',
  )!.content;
  const facts = JSON.parse(
    llm.calls[0].messages.find((message) => message.role === 'user')!.content,
  );
  expect(system).toContain('Start with what changed and the new total');
  expect(facts.changes).toEqual(diff);
  expect(facts.selected.grandTotal).toBe(
    options.find((option) => option.profile === 'balanced')!.grandTotal,
  );
});
it('provides previous and next constraint values plus labelled item changes for opaque stable keys', async () => {
  const previous = {
    ...plan,
    budget: 1500000,
    deadline: '2026-09-05',
    items: [
      { ...plan.items[0], key: 'item-2', needLabel: 'Notebooks', quantity: 1 },
    ],
  };
  const next = {
    ...previous,
    budget: 1000000,
    deadline: '2026-09-04',
    items: [{ ...previous.items[0], quantity: 2 }],
  };
  const llm = new FakeLLM();
  for await (const chunk of explainKit(
    llm,
    next,
    options,
    { added: [], removed: [], changed: ['item-2'] },
    previous,
  )) {
    void chunk;
  }
  const facts = JSON.parse(
    llm.calls[0].messages.find((message) => message.role === 'user')!.content,
  );
  expect(facts.changeContext.before).toEqual({
    budget: 1500000,
    deadline: '2026-09-05',
  });
  expect(facts.changeContext.after).toEqual({
    budget: 1000000,
    deadline: '2026-09-04',
  });
  expect(facts.changeContext.changed).toMatchObject([
    {
      before: { key: 'item-2', needLabel: 'Notebooks', quantity: 1 },
      after: { key: 'item-2', needLabel: 'Notebooks', quantity: 2 },
    },
  ]);
});
it('T20a explains Balanced with grounded Saver/Premium line differences and enforces70words across stream chunks', async () => {
  const balanced = options.find((o) => o.profile === 'balanced')!;
  const saver = {
    ...balanced,
    profile: 'saver' as const,
    grandTotal: balanced.grandTotal - 100000,
    lines: balanced.lines.map((l, i) =>
      i
        ? l
        : {
            ...l,
            product: { ...l.product, id: 'saver-product', title: 'Saver pens' },
          },
    ),
  };
  const premium = {
    ...balanced,
    profile: 'premium' as const,
    grandTotal: balanced.grandTotal + 200000,
    lines: balanced.lines.map((l, i) =>
      i
        ? l
        : {
            ...l,
            product: {
              ...l.product,
              id: 'premium-product',
              title: 'Premium pens',
            },
          },
    ),
  };
  const llm = new FakeLLM(
    [],
    ['Balanced fits. ', ...Array.from({ length: 90 }, (_, i) => `word${i} `)],
  );
  let text = '';
  for await (const chunk of explainKit(llm, plan, [premium, saver, balanced]))
    text += chunk;
  const facts = JSON.parse(llm.calls[0].messages[1].content);
  expect(facts.selected.profile).toBe('balanced');
  expect(facts.profileComparison.saver).toMatchObject({
    deltaFromBalanced: -100000,
    changedItems: [{ title: 'Saver pens' }],
  });
  expect(facts.profileComparison.premium).toMatchObject({
    deltaFromBalanced: 200000,
    changedItems: [{ title: 'Premium pens' }],
  });
  expect(llm.calls[0].messages[0].content).toContain(
    'one short sentence comparing Saver and Premium',
  );
  expect(llm.calls[0].messages[0].content).toContain(
    'Name one changed category',
  );
  expect(text.trim()).toBe('Balanced fits.');
  expect(text.trim().split(/\s+/).length).toBeLessThanOrEqual(70);
});

it('B1 never streams a partial sentence when the word cap crosses chunk boundaries', async () => {
  const answer = [
    'Uniforms removed. ',
    'The new basket fits your budget. ',
    ...Array.from({ length: 80 }, () => 'unfinished '),
  ];
  let text = '';
  for await (const delta of explainKit(new FakeLLM([], answer), plan, options))
    text += delta;
  expect(text.trim()).toBe(
    'Uniforms removed. The new basket fits your budget.',
  );
});

it('B1 retains a complete sentence ending exactly at the cap and ignores decimal punctuation', async () => {
  const sentence = 'The total is 1.5 million. ' + 'value '.repeat(64) + 'fits.';
  let text = '';
  for await (const delta of explainKit(
    new FakeLLM([], [sentence, ' More text.']),
    plan,
    options,
  ))
    text += delta;
  expect(text).toBe(sentence);
});
