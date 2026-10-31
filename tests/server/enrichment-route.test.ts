import { expect, it, vi, afterEach } from 'vitest';
import { InMemoryAdapter } from '@/server/commerce';
import { FakeLLM } from '@/server/llm';
import { createEnrichmentHandlers } from '@/server/enrichment/http';
import { enrichmentPreviewResponseSchema } from '@/contract/schemas';
import { matchPlan } from '@/server/matcher';
import { getInsights } from '@/server/insights';
const draft = {
  titleSuffix: 'Anti-hunchback',
  tags: ['anti-hunchback'],
  attributes: [],
  descriptionAppend: '',
  evidence: 'spine straight',
};
const verify = {
  tags: [{ tag: 'anti-hunchback', supports: true, evidence: 'spine straight' }],
};
const post = (body: unknown) =>
  new Request('http://localhost', {
    method: 'POST',
    body: JSON.stringify(body),
  });
afterEach(() => vi.useRealTimers());
it('S4 preview crosses instances, apply closes buyer matcher gap and insights fix, undo restores exactly even later; repeat apply/undo fail', async () => {
  const adapter = new InMemoryAdapter();
  const before = (await adapter.getProduct('prod-minhan-backpack'))!;
  const deps = {
    adapter,
    llm: new FakeLLM([{ ...draft, tagEvidence: verify.tags }]),
    secret: 'test-secret',
  };
  const first = createEnrichmentHandlers(deps);
  const preview = await first.preview(
    post({ productId: before.id, gapKey: 'school-backpack|anti-hunchback' }),
  );
  expect(preview.status).toBe(200);
  const body = enrichmentPreviewResponseSchema.parse(await preview.json());
  expect(body.added.tags).toContain('anti-hunchback');
  const next = createEnrichmentHandlers({ ...deps, llm: new FakeLLM() });
  expect((await next.apply(post({ proposalId: body.proposalId }))).status).toBe(
    200,
  );
  expect((await next.apply(post({ proposalId: body.proposalId }))).status).toBe(
    404,
  );
  const plan = {
    event: 'back_to_school' as const,
    language: 'en' as const,
    budget: 1500000,
    deadline: '2026-09-05',
    assumptions: [],
    items: [
      {
        key: 'backpack',
        needLabel: 'Backpack',
        category: 'school-backpack',
        required: true,
        quantity: 1,
        mustHaveTags: ['anti-hunchback'],
        niceToHaveTags: [],
        maxUnitPrice: 400000,
      },
    ],
  };
  const matches = await matchPlan(plan, adapter);
  expect(
    matches.candidates.backpack.some((c) => c.product.id === before.id),
  ).toBe(true);
  // Real insights path, pre-populate only its external LLM answers for fixture gaps.
  const insights = await getInsights(
    {
      adapter,
      cache: adapter,
      llm: new FakeLLM(
        Array.from({ length: 100 }, () => ({
          supports: false,
          evidence: '',
          advice: 'Update the listing.',
        })),
      ),
    },
    'shop-minhan',
  );
  expect(
    insights.gaps.find((g) => g.key === 'school-backpack|anti-hunchback')
      ?.appliedFix?.productId,
  ).toBe(before.id);
  vi.useFakeTimers();
  vi.setSystemTime(Date.now() + 3600000);
  expect((await next.undo(post({ productId: before.id }))).status).toBe(200);
  expect(await adapter.getProduct(before.id)).toEqual(before);
  expect((await next.undo(post({ productId: before.id }))).status).toBe(404);
  const undone = await getInsights(
    {
      adapter,
      cache: adapter,
      llm: new FakeLLM(
        Array.from({ length: 100 }, () => ({
          supports: true,
          evidence: 'spine straight',
          advice: 'Update the listing.',
        })),
      ),
    },
    'shop-minhan',
  );
  expect(
    undone.gaps.find((g) => g.key === 'school-backpack|anti-hunchback')
      ?.appliedFix,
  ).toBeNull();
});
it('S4 rejects expired, unknown and tampered tokens; changed listing conflicts', async () => {
  const adapter = new InMemoryAdapter();
  const handlers = createEnrichmentHandlers({
    adapter,
    llm: new FakeLLM([{ ...draft, tagEvidence: verify.tags }]),
    secret: 'test-secret',
  });
  const body = await (
    await handlers.preview(
      post({
        productId: 'prod-minhan-backpack',
        gapKey: 'school-backpack|anti-hunchback',
      }),
    )
  ).json();
  for (const proposalId of ['unknown', body.proposalId + 'x'])
    expect((await handlers.apply(post({ proposalId }))).status).toBe(404);
  const p = (await adapter.getProduct('prod-minhan-backpack'))!;
  await adapter.updateListing(p.id, { ...p, title: p.title + ' changed' });
  expect(
    (await handlers.apply(post({ proposalId: body.proposalId }))).status,
  ).toBe(409);
  await adapter.undoListing(p.id);
  vi.useFakeTimers();
  vi.setSystemTime(Date.now() + 31 * 60000);
  expect(
    (await handlers.apply(post({ proposalId: body.proposalId }))).status,
  ).toBe(404);
});

it('B2 preview adds an evidence-backed suffix, paragraph and supported companion tags', async () => {
  const adapter = new InMemoryAdapter();
  const before = (await adapter.getProduct('prod-minhan-backpack'))!;
  const handlers = createEnrichmentHandlers({
    adapter,
    secret: 'test-secret',
    llm: new FakeLLM([
      {
        ...draft,
        titleSuffix: '',
        tags: ['anti-hunchback', 'lightweight', 'waterproof', 'grade-1'],
        tagEvidence: [
          { tag: 'anti-hunchback', supports: true, evidence: 'spine straight' },
          { tag: 'lightweight', supports: true, evidence: before.description },
          {
            tag: 'waterproof',
            supports: true,
            evidence: 'invented waterproof claim',
          },
          { tag: 'grade-1', supports: false, evidence: before.description },
        ],
      },
    ]),
  });
  const response = await handlers.preview(
    post({ productId: before.id, gapKey: 'school-backpack|anti-hunchback' }),
  );
  expect(response.status).toBe(200);
  const preview = enrichmentPreviewResponseSchema.parse(await response.json());
  expect(preview.after.title).toMatch(
    new RegExp('^' + before.title + ' \\| .+'),
  );
  expect(preview.added.tags).toEqual(['anti-hunchback', 'lightweight']);
  expect(preview.added.descriptionAppend).toContain('spine straight');
  expect(preview.keywordCheck.every((k) => k.stillMatches)).toBe(true);
});
