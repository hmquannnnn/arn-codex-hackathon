import { expect, it } from 'vitest';
import { InMemoryAdapter } from '@/server/commerce';
import { mergeEnrichment, keywordCheck } from '@/server/enrichment/merge';
it('S4 enrichment preserves original title, attributes and keywords and removes repeated description sentences', async () => {
  const p = (await new InMemoryAdapter().getProduct('prod-minhan-backpack'))!;
  const after = mergeEnrichment(p, {
    titleSuffix: 'Anti-hunchback '.repeat(20),
    tags: ['anti-hunchback', ...p.tags],
    attributes: {
      ...Object.fromEntries(
        Object.keys(p.attributes).map((k) => [k, 'overwrite']),
      ),
      verified: 'yes',
    },
    descriptionAppend: p.description.toUpperCase(),
  });
  expect(after.title.startsWith(p.title)).toBe(true);
  expect(after.title.length).toBeLessThanOrEqual(120);
  expect(after.description).toBe(p.description);
  expect(after.attributes).toEqual({ ...p.attributes, verified: 'yes' });
  expect(after.tags).toEqual([...new Set([...p.tags, 'anti-hunchback'])]);
  expect(keywordCheck(p, after).every((k) => k.stillMatches)).toBe(true);
  expect(
    mergeEnrichment(p, {
      titleSuffix: '',
      tags: [],
      attributes: {},
      descriptionAppend: '',
    }),
  ).toEqual(p);
});

import { FakeLLM } from '@/server/llm';
import { proposeEnrichment } from '@/server/enrichment/propose';
const draft = {
  titleSuffix: 'Anti-hunchback',
  tags: ['anti-hunchback (spine support)'],
  attributes: [],
  descriptionAppend: '',
  evidence: 'spine straight',
  tagEvidence: [
    { tag: 'anti-hunchback', supports: true, evidence: 'spine straight' },
    { tag: 'waterproof', supports: true, evidence: 'invented quote' },
  ],
};
it('S4 retries a missing gap tag, accepts tag hints, and code drops tags without verified source evidence', async () => {
  const p = (await new InMemoryAdapter().getProduct('prod-minhan-backpack'))!;
  const llm = new FakeLLM([
    { ...draft, tags: [] },
    { ...draft, tags: [...draft.tags, 'waterproof'] },
  ]);
  const proposal = await proposeEnrichment(
    p,
    { tags: ['anti-hunchback', 'waterproof'], needLabel: 'Backpack' },
    llm,
  );
  expect(proposal.tags).toEqual(['anti-hunchback']);
  expect(llm.calls).toHaveLength(2);
  const input = JSON.parse(llm.calls[0].messages[1].content);
  expect(input.allowedTags).toEqual(['anti-hunchback', 'waterproof']);
  expect(input.tagHints).toBeDefined();
  expect(llm.calls[0].messages[0].content).toContain('not already');
});
it('S4 refuses proposals after two drafts without an evidence-supported gap tag', async () => {
  const p = (await new InMemoryAdapter().getProduct('prod-minhan-backpack'))!;
  await expect(
    proposeEnrichment(
      p,
      { tags: ['anti-hunchback'], needLabel: 'Backpack' },
      new FakeLLM([
        { ...draft, tags: [] },
        { ...draft, tags: [] },
      ]),
    ),
  ).rejects.toMatchObject({ status: 409, code: 'nothing_to_add' });
});
it('S4 appends new sentences verbatim without breaking decimal weights', async () => {
  const p = (await new InMemoryAdapter().getProduct('prod-minhan-backpack'))!;
  const after = mergeEnrichment(p, {
    titleSuffix: '',
    tags: [],
    attributes: {},
    descriptionAppend: `${p.description} Carries 1.5 kg.`,
  });
  expect(after.description).toBe(p.description + '\n\nCarries 1.5 kg.');
});
import { zodTextFormat } from 'openai/helpers/zod';
import type { z } from 'zod';
import type { LLMOptions, Message } from '@/server/llm/types';
it('S4 draft schema is accepted by strict Structured Outputs, with attributes returned as a record', async () => {
  class StrictFakeLLM extends FakeLLM {
    override structured<T>(
      model: string,
      schema: z.ZodType<T>,
      messages: Message[],
      options?: LLMOptions,
    ) {
      zodTextFormat(schema, 'result');
      return super.structured(model, schema, messages, options);
    }
  }
  const p = (await new InMemoryAdapter().getProduct('prod-minhan-backpack'))!;
  const result = await proposeEnrichment(
    p,
    { tags: ['anti-hunchback'], needLabel: 'Backpack' },
    new StrictFakeLLM([
      { ...draft, attributes: [{ key: 'support', value: 'S-shaped straps' }] },
    ]),
  );
  expect(result.attributes).toEqual({ support: 'S-shaped straps' });
});
