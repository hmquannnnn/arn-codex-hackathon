import { expect, it } from 'vitest';
import { InMemoryAdapter, SupabaseAdapter } from '@/server/commerce';
import { FakeLLM } from '@/server/llm';
import { createWatchHandler } from '@/server/demand/watch';
import { getInsights } from '@/server/insights';
import { demandWatchResponseSchema } from '@/contract/schemas';
const post = (body: unknown) =>
  new Request('http://localhost/api/demand/watch', {
    method: 'POST',
    body: JSON.stringify(body),
  });
it('watch endpoint increments a gap count and insights reflects it without changing demand counts', async () => {
  const adapter = new InMemoryAdapter();
  const handler = createWatchHandler(() => adapter);
  const gapKey = 'kids-raincoat|backpack-cover';
  for (const watchers of [1, 2]) {
    const response = await handler(post({ gapKey }));
    expect(response.status).toBe(200);
    expect(demandWatchResponseSchema.parse(await response.json())).toEqual({
      watchers,
    });
  }
  const llm = new FakeLLM(
    Array.from({ length: 100 }, () => ({
      supports: false,
      evidence: '',
      advice: 'Consider stocking.',
    })),
  );
  const insights = await getInsights(
    { adapter, cache: adapter, llm },
    'shop-minhan',
  );
  expect(insights.gaps.find((g) => g.key === gapKey)).toMatchObject({
    watchers: 2,
    thisWeek: 20,
  });
  expect(
    insights.gaps.find((g) => g.key === 'school-backpack|anti-hunchback')
      ?.watchers,
  ).toBe(0);
  expect((await handler(post({}))).status).toBe(400);
  expect((await handler(post({ gapKey: '' }))).status).toBe(400);
});
it.skipIf(process.env.KITLY_TEST_WATCH_REAL !== '1')(
  'watch persists across independent Supabase adapters',
  async () => {
    const { createDb } = await import('@/server/db');
    const gapKey = 'test-watch-' + crypto.randomUUID();
    try {
      const first = new SupabaseAdapter(),
        second = new SupabaseAdapter();
      expect(await first.addDemandWatch(gapKey)).toBe(1);
      expect(await second.addDemandWatch(gapKey)).toBe(2);
      expect(
        await new SupabaseAdapter().demandWatchCounts([gapKey, 'absent']),
      ).toEqual({ [gapKey]: 2, absent: 0 });
    } finally {
      await createDb().from('demand_watches').delete().eq('gap_key', gapKey);
    }
  },
  30000,
);
