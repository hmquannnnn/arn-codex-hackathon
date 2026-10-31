import { expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import { SupabaseAdapter } from '@/server/commerce';
import { SupabaseKitStore } from '@/server/kits';
import { OpenAILLM, FakeLLM } from '@/server/llm';
import { getInsights } from '@/server/insights';
import { runKit } from '@/server/pipeline';
import { kitPlanSchema, insightsResponseSchema } from '@/contract/schemas';
import { createDb } from '@/server/db';
import fixture from '@/contract/fixtures/kit.sample.json';
it.skipIf(process.env.KITLY_TEST_INSIGHTS_REAL !== '1')(
  'S3 real DB/model counts live hero once, preserves300k–400k band and durable applied/undo state',
  async () => {
    const adapter = new SupabaseAdapter(),
      store = new SupabaseKitStore(),
      deps = { adapter, cache: adapter, llm: new OpenAILLM() },
      owner = 'test-insights-' + randomUUID();
    const sessions: string[] = [];
    let threadId: string | undefined,
      pendingUndo = false;
    try {
      const before = insightsResponseSchema.parse(
        await getInsights(deps, 'shop-minhan'),
      );
      const hero = before.gaps.find(
        (g) => g.key === 'school-backpack|anti-hunchback',
      )!;
      expect(before.gaps[0].key).toBe(hero.key);
      expect(hero.type).toBe('listing_gap');
      expect(hero.priceBand).toEqual({ p25: 300000, p75: 400000 });
      const plan = kitPlanSchema.parse(
        fixture.find((e) => e.event === 'plan')!.data.plan,
      );
      for await (const e of runKit(
        { query: 'S3 hero kit', owner, persona: 'lan' },
        { adapter, store, llm: new FakeLLM([plan]) },
      ))
        if (e.event === 'plan') {
          threadId = e.data.threadId;
          sessions.push(e.data.sessionId);
        }
      const after = await getInsights(deps, 'shop-minhan'),
        changed = after.gaps.find((g) => g.key === hero.key)!;
      expect(changed.thisWeek).toBe(hero.thisWeek + 1);
      expect(changed.priceBand).toEqual(hero.priceBand);
      expect(
        after.recent.some((r) => r.needLabel === 'Anti-hunchback backpack'),
      ).toBe(true);
      const p = (await adapter.getProduct('prod-minhan-backpack'))!;
      await adapter.updateListing(p.id, {
        title: p.title,
        description: p.description,
        tags: [...p.tags, 'anti-hunchback'],
        attributes: p.attributes,
      });
      pendingUndo = true;
      const fixed = await getInsights(
        { ...deps, adapter: new SupabaseAdapter() },
        'shop-minhan',
      );
      expect(fixed.gaps[0]).toMatchObject({
        type: 'listing_gap',
        appliedFix: { productId: p.id },
      });
      await adapter.undoListing(p.id);
      pendingUndo = false;
      expect(
        (await getInsights(deps, 'shop-minhan')).gaps[0].appliedFix,
      ).toBeNull();
      console.info(
        `seeded seller hero ${hero.thisWeek}->${changed.thisWeek}, band300000–400000, apply/undo passed`,
      );
    } finally {
      if (pendingUndo) await adapter.undoListing('prod-minhan-backpack');
      const db = createDb();
      if (threadId)
        await db
          .from('kit_threads')
          .delete()
          .eq('id', threadId)
          .eq('owner', owner);
      if (sessions.length)
        await db.from('intent_sessions').delete().in('id', sessions);
    }
  },
  120000,
);
