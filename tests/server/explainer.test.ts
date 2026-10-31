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
