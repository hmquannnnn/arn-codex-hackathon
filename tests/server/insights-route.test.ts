import { expect, it } from 'vitest';
import { InMemoryAdapter } from '@/server/commerce';
import { FakeLLM } from '@/server/llm';
import { createInsightsHandler } from '@/server/insights/http';
it('S3 insights HTTP returns valid empty response,404 for unknown shop and generic503 on unavailable model', async () => {
  const adapter = new InMemoryAdapter({ demand: [] });
  const handler = createInsightsHandler({
    adapter,
    cache: adapter,
    llm: new FakeLLM(),
  });
  const response = await handler(
    new Request('http://localhost/api/seller/insights?shopId=shop-minhan'),
  );
  expect(response.status).toBe(200);
  expect((await response.json()).gaps).toEqual([]);
  expect(
    (
      await handler(
        new Request('http://localhost/api/seller/insights?shopId=not-real'),
      )
    ).status,
  ).toBe(404);
  const seeded = new InMemoryAdapter();
  const failed = await createInsightsHandler({
    adapter: seeded,
    cache: seeded,
    llm: new FakeLLM([new Error('private upstream problem')]),
  })(new Request('http://localhost/api/seller/insights?shopId=shop-minhan'));
  expect(failed.status).toBe(503);
  expect(await failed.text()).not.toContain('private');
});
it('S3 seller HTTP survives a single statement timeout in the live strip read', async () => {
  class OnceUnavailable extends InMemoryAdapter {
    reads = 0;
    override async recentDemandItems(limit: number) {
      if (++this.reads === 1) throw Error('statement timeout');
      return super.recentDemandItems(limit);
    }
  }
  const adapter = new OnceUnavailable({ demand: [] });
  const response = await createInsightsHandler({
    adapter,
    cache: adapter,
    llm: new FakeLLM(),
  })(new Request('http://localhost/api/seller/insights?shopId=all'));
  expect(response.status).toBe(200);
  expect(adapter.reads).toBe(2);
});
