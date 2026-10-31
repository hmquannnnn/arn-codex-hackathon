import { expect, it } from 'vitest';
import { SupabaseAdapter } from '@/server/commerce';
import { OpenAILLM } from '@/server/llm';
import { createEnrichmentHandlers } from '@/server/enrichment/http';
import { getInsights } from '@/server/insights';
import { enrichmentPreviewResponseSchema } from '@/contract/schemas';
const post = (body: unknown) =>
  new Request('http://localhost', {
    method: 'POST',
    body: JSON.stringify(body),
  });
it.skipIf(process.env.KITLY_TEST_ENRICHMENT_REAL !== '1')(
  'S4 real model/DB preview applies across independent adapters and durable insights reload, then restores exact original',
  async () => {
    const adapter = new SupabaseAdapter(),
      original = (await adapter.getProduct('prod-minhan-backpack'))!;
    const llm = new OpenAILLM();
    const handlers = () =>
      createEnrichmentHandlers({ adapter: new SupabaseAdapter(), llm });
    let applied = false;
    try {
      const preview = await handlers().preview(
        post({
          productId: original.id,
          gapKey: 'school-backpack|anti-hunchback',
        }),
      );
      expect(preview.status).toBe(200);
      const body = enrichmentPreviewResponseSchema.parse(await preview.json());
      expect(body.added.tags).toContain('anti-hunchback');
      expect(body.keywordCheck.every((k) => k.stillMatches)).toBe(true);
      const apply = await handlers().apply(
        post({ proposalId: body.proposalId }),
      );
      applied = apply.status === 200;
      expect(apply.status).toBe(200);
      expect(
        (await handlers().apply(post({ proposalId: body.proposalId }))).status,
      ).toBe(404);
      const db = new SupabaseAdapter();
      const insights = await getInsights(
        { adapter: db, cache: db, llm },
        'shop-minhan',
      );
      expect(
        insights.gaps.find((g) => g.key === 'school-backpack|anti-hunchback')
          ?.appliedFix?.productId,
      ).toBe(original.id);
      expect(
        (await handlers().undo(post({ productId: original.id }))).status,
      ).toBe(200);
      applied = false;
      expect(await new SupabaseAdapter().getProduct(original.id)).toEqual(
        original,
      );
      const undone = await getInsights(
        { adapter: db, cache: db, llm },
        'shop-minhan',
      );
      expect(
        undone.gaps.find((g) => g.key === 'school-backpack|anti-hunchback')
          ?.appliedFix,
      ).toBeNull();
      console.info(
        'real enrichment: preview/apply/replay404/insights/undo/restored passed',
      );
    } finally {
      if (applied) await adapter.undoListing(original.id);
    }
  },
  180000,
);
