import { afterEach, describe, expect, it, vi } from 'vitest';
import type { CommerceAdapter } from '@/contract/commerce-adapter';
import type { KitPlan } from '@/contract/types';
import { createDb } from '@/server/db';
import { InMemoryAdapter, SupabaseAdapter } from '@/server/commerce';

for (const backend of ['memory', 'supabase'] as const) {
  describe.skipIf(backend === 'supabase' && !process.env.SUPABASE_URL)(
    `${backend} CommerceAdapter contract`,
    () => {
      const sessions: string[] = [];
      afterEach(async () => {
        vi.unstubAllEnvs();
        if (backend === 'supabase' && sessions.length) {
          const { error } = await createDb()
            .from('intent_sessions')
            .delete()
            .in('id', sessions.splice(0));
          if (error) throw error;
        }
      });
      const plan: KitPlan = {
        event: 'other',
        language: 'en',
        budget: 500000,
        deadline: null,
        assumptions: [],
        items: [
          {
            key: 'contract',
            needLabel: 'Contract backpack',
            category: 'school-backpack',
            required: true,
            quantity: 1,
            mustHaveTags: ['kids'],
            niceToHaveTags: [],
            maxUnitPrice: 400000,
          },
        ],
      };
      const adapter = (): CommerceAdapter =>
        backend === 'memory' ? new InMemoryAdapter() : new SupabaseAdapter();
      it('persists listing snapshots across adapter instances and undoes exact whitelisted changes', async () => {
        const a = adapter();
        await expect(
          a.updateListing('not-a-product', {
            title: 'Missing',
            description: '',
            tags: [],
            attributes: {},
          }),
        ).rejects.toThrow();
        const original = await a.getProduct('prod-minhan-backpack');
        if (!original) throw new Error('Run the T01 seed first');
        let pendingUndo = 0;
        const reader = backend === 'supabase' ? adapter() : a;
        try {
          const changed = await a.updateListing(original.id, {
            ...original,
            id: 'must-not-change',
            price: 1,
            stock: 0,
            shipDaysMax: 99,
            title: original.title + ' Contract',
            tags: [...original.tags, 'contract-test'],
          } as typeof original);
          pendingUndo++;
          expect(changed).toMatchObject({
            id: original.id,
            price: original.price,
            stock: original.stock,
            shipDaysMax: original.shipDaysMax,
          });
          expect(changed.updatedForDemandAt).not.toBeNull();
          changed.tags.push('not-persisted');
          expect((await reader.getProduct(original.id))?.tags).not.toContain(
            'not-persisted',
          );
          await reader.updateListing(original.id, {
            title: original.title + ' Second',
            description: original.description,
            tags: original.tags,
            attributes: original.attributes,
          });
          pendingUndo++;
          const firstUndo = await a.undoListing(original.id);
          pendingUndo--;
          expect(firstUndo?.title).toBe(original.title + ' Contract');
          const restored = await reader.undoListing(original.id);
          pendingUndo--;
          expect(restored).toEqual(original);
          expect(await a.undoListing('not-a-product')).toBeNull();
          await expect(
            a.updateListing('not-a-product', original),
          ).rejects.toThrow();
        } finally {
          while (pendingUndo-- > 0) await a.undoListing(original.id);
        }
      }, 20000);
      it('returns demand beyond the PostgREST 1000-row page for history and recent live views', async () => {
        vi.stubEnv('DEMO_TODAY', '2026-09-02');
        const a = adapter();
        const live = await a.recordIntent({
          query: 'contract pagination',
          plan,
          source: 'live',
        });
        sessions.push(live.sessionId);
        await a.recordDemandItems(
          live.sessionId,
          Array.from({ length: 1005 }, () => ({
            item: plan.items[0],
            matchedCount: 0,
            budgetHint: 350000,
          })),
        );
        expect(
          (await a.demandItemsSince('2026-09-02')).filter(
            (r) => r.sessionId === live.sessionId,
          ),
        ).toHaveLength(1005);
        expect(
          (await a.recentDemandItems(1100)).filter(
            (r) => r.sessionId === live.sessionId,
          ),
        ).toHaveLength(1005);
      }, 15000);
      it('records demand in the intent event and demo date, joins only live sessions and filters history', async () => {
        vi.stubEnv('DEMO_TODAY', '2026-09-02');
        const a = adapter();
        const seed = await a.recordIntent({
          query: 'contract seed',
          plan,
          source: 'seed',
        });
        sessions.push(seed.sessionId);
        await a.recordDemandItems(seed.sessionId, [
          { item: plan.items[0], matchedCount: 1, budgetHint: 350000 },
        ]);
        const live = await a.recordIntent({
          query: 'contract live',
          plan,
          source: 'live',
        });
        sessions.push(live.sessionId);
        await a.recordDemandItems(live.sessionId, [
          { item: plan.items[0], matchedCount: 0, budgetHint: null },
        ]);
        const reader = backend === 'supabase' ? adapter() : a;
        const recent = await reader.recentDemandItems(100);
        expect(
          recent.find((r) => r.sessionId === live.sessionId),
        ).toMatchObject({
          event: 'other',
          needLabel: 'Contract backpack',
          category: 'school-backpack',
          tags: ['kids'],
          matchedCount: 0,
          budgetHint: null,
          source: 'live',
        });
        expect(recent.some((r) => r.sessionId === seed.sessionId)).toBe(false);
        const history = await reader.demandItemsSince('2026-09-02', {
          category: 'school-backpack',
        });
        expect(
          history.filter((r) =>
            [seed.sessionId, live.sessionId].includes(r.sessionId),
          ),
        ).toHaveLength(2);
        expect(
          history.find((r) => r.sessionId === live.sessionId)?.createdAt,
        ).toMatch(/^2026-09-02T/);
        expect(
          (await reader.demandItemsSince('2026-09-03')).some(
            (r) => r.sessionId === live.sessionId,
          ),
        ).toBe(false);
        expect(await reader.recentDemandItems(0)).toEqual([]);
        await expect(
          a.recordDemandItems('00000000-0000-0000-0000-000000000000', []),
        ).rejects.toThrow();
      }, 15000);
      it('returns the built-in guest and isolates wallet vouchers', async () => {
        const a = adapter();
        expect(await a.getPersona('guest')).toEqual({
          id: 'guest',
          name: 'Guest',
          address: null,
          favoriteShopIds: [],
          cart: [],
        });
        const lan = await a.getPersona('lan');
        expect(lan.address).toEqual({ district: 'Cau Giay', city: 'Hanoi' });
        expect(lan.cart[0].productId).toBe('prod-kidzone-lite-backpack');
        expect(await a.listVouchers()).toHaveLength(8);
        expect(await a.listVouchers('guest')).toHaveLength(8);
        expect(await a.listVouchers('lan')).toHaveLength(10);
        expect(
          (await a.listVouchers('lan'))
            .filter((v) => v.ownerPersona === 'lan')
            .map((v) => v.code)
            .sort(),
        ).toEqual(['LAN-BTS10', 'LAN-KZ80']);
      });
      it('reads catalog and combines category, text, tags, price, and limit filters', async () => {
        const a = adapter();
        expect((await a.listShops()).map((s) => s.id)).toContain('shop-minhan');
        expect(await a.getProduct('not-a-product')).toBeNull();
        expect(await a.searchProducts({ categories: [] })).toEqual([]);
        expect(await a.searchProducts({ limit: 0 })).toEqual([]);
        const categoryHits = await a.searchProducts({
          categories: ['school-backpack', 'kids-raincoat'],
        });
        expect(
          [...new Set(categoryHits.map((p) => p.category))].sort(),
        ).toEqual(['kids-raincoat', 'school-backpack']);
        expect(
          (await a.searchProducts({ text: 'grade-' })).map((p) => p.id),
        ).toContain('prod-kidzone-lite-backpack');
        expect(await a.searchProducts({ maxPrice: 0 })).toEqual([]);
        const hits = await a.searchProducts({
          categories: ['school-backpack', 'kids-raincoat'],
          category: 'school-backpack',
          text: ' MINH AN ',
          tagsAny: ['kids'],
          maxPrice: 400000,
          limit: 1,
        });
        expect(hits.map((p) => p.id)).toEqual(['prod-minhan-backpack']);
        expect(await a.getProduct(hits[0].id)).toEqual(hits[0]);
      });
    },
  );
}
