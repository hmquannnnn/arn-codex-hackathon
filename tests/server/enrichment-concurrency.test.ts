import { expect, it } from 'vitest';
import { InMemoryAdapter } from '@/server/commerce';
import { SupabaseAdapter } from '@/server/commerce';
import { createEnrichmentHandlers } from '@/server/enrichment/http';
import { FakeLLM } from '@/server/llm';
const post = (body: unknown) =>
  new Request('http://localhost', {
    method: 'POST',
    body: JSON.stringify(body),
  });
for (const real of [false, true])
  it.skipIf(real && process.env.KITLY_TEST_ENRICHMENT_REAL !== '1')(
    `S4 ${real ? 'Supabase' : 'memory'} concurrent apply uses one snapshot and one successful apply`,
    async () => {
      const adapter = real ? new SupabaseAdapter() : new InMemoryAdapter();
      const original = (await adapter.getProduct('prod-minhan-backpack'))!;
      const llm = new FakeLLM([
        {
          titleSuffix: 'Anti-hunchback',
          tags: ['anti-hunchback'],
          attributes: [],
          descriptionAppend: '',
          evidence: 'spine straight',
          tagEvidence: [
            {
              tag: 'anti-hunchback',
              supports: true,
              evidence: 'spine straight',
            },
          ],
        },
      ]);
      const handlers = createEnrichmentHandlers({
        adapter,
        llm,
        secret: 'test-secret',
      });
      let applied = false;
      try {
        const preview = await (
          await handlers.preview(
            post({
              productId: original.id,
              gapKey: 'school-backpack|anti-hunchback',
            }),
          )
        ).json();
        const responses = await Promise.all(
          Array.from({ length: 2 }, () =>
            createEnrichmentHandlers({
              adapter: real ? new SupabaseAdapter() : adapter,
              llm: new FakeLLM(),
              secret: 'test-secret',
            }).apply(post({ proposalId: preview.proposalId })),
          ),
        );
        applied = responses.some((r) => r.status === 200);
        expect(responses.map((r) => r.status).sort()).toEqual([200, 404]);
        expect(
          (await handlers.undo(post({ productId: original.id }))).status,
        ).toBe(200);
        applied = false;
        expect(await adapter.getProduct(original.id)).toEqual(original);
        expect(
          (await handlers.undo(post({ productId: original.id }))).status,
        ).toBe(404);
      } finally {
        if (applied) await adapter.undoListing(original.id);
      }
    },
    60000,
  );
