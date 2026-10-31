import { afterEach, expect, it, vi } from 'vitest';
import { InMemoryAdapter, getAdapter } from '@/server/commerce';
import { today } from '@/server/today';
import type { KitPlan } from '@/contract/types';
afterEach(() => vi.unstubAllEnvs());
it('exposes public vouchers plus only the selected persona wallet', async () => {
  const a = new InMemoryAdapter();
  expect(await a.listVouchers('lan')).toHaveLength(10);
  expect(await a.listVouchers('guest')).toHaveLength(8);
  expect(await a.listVouchers()).toHaveLength(8);
  expect((await a.getPersona('lan')).cart[0].productId).toBe(
    'prod-kidzone-lite-backpack',
  );
  expect(await a.getPersona('guest')).toMatchObject({
    address: null,
    cart: [],
  });
});
it('updates a listing and restores exact snapshots in reverse order without leaking references', async () => {
  const a = new InMemoryAdapter();
  const original = await a.getProduct('prod-minhan-backpack');
  if (!original) throw Error('fixture missing');
  const patch = {
    title: original.title + ' Anti-hunchback',
    description: original.description,
    tags: [...original.tags, 'anti-hunchback'],
    attributes: original.attributes,
  };
  const changed = await a.updateListing(original.id, patch);
  expect(changed.tags).toContain('anti-hunchback');
  expect(changed.updatedForDemandAt).not.toBeNull();
  changed.tags.push('not-persisted');
  expect((await a.getProduct(original.id))?.tags).not.toContain(
    'not-persisted',
  );
  await a.updateListing(original.id, {
    ...patch,
    title: patch.title + ' Lightweight',
  });
  expect((await a.undoListing(original.id))?.title).toBe(patch.title);
  expect(await a.undoListing(original.id)).toEqual(original);
  expect(await a.undoListing(original.id)).toBeNull();
  await expect(a.updateListing('missing', patch)).rejects.toThrow();
});
it('filters the catalog by category lists, keyword, price, tags, and limit', async () => {
  const a = new InMemoryAdapter();
  expect(await a.searchProducts({ categories: [] })).toEqual([]);
  expect(
    (
      await a.searchProducts({ categories: ['school-backpack', 'notebooks'] })
    ).every((p) => ['school-backpack', 'notebooks'].includes(p.category)),
  ).toBe(true);
  expect(
    (
      await a.searchProducts({
        text: 'MINH AN',
        category: 'school-backpack',
        maxPrice: 400000,
        limit: 1,
      })
    ).map((p) => p.id),
  ).toEqual(['prod-minhan-backpack']);
  expect(
    (await a.searchProducts({ tagsAny: ['anti-hunchback'] })).map(
      (p) => p.price,
    ),
  ).toEqual([890000]);
  expect(await a.getProduct('missing')).toBeNull();
  expect(await a.listShops()).toHaveLength(7);
});
it('records live and seed demand, filters history, and returns only newest live items', async () => {
  vi.stubEnv('DEMO_TODAY', '2026-09-02');
  const a = new InMemoryAdapter();
  const plan: KitPlan = {
    event: 'other',
    language: 'en',
    budget: 500000,
    deadline: null,
    assumptions: [],
    items: [
      {
        key: 'dog',
        needLabel: 'Dog food',
        category: null,
        required: true,
        quantity: 1,
        mustHaveTags: [],
        niceToHaveTags: [],
        maxUnitPrice: null,
      },
    ],
  };
  const seed = await a.recordIntent({ query: 'seed', plan, source: 'seed' });
  await a.recordDemandItems(seed.sessionId, [
    { item: plan.items[0], matchedCount: 0, budgetHint: null },
  ]);
  const live = await a.recordIntent({ query: 'puppy', plan, source: 'live' });
  await a.recordDemandItems(live.sessionId, [
    { item: plan.items[0], matchedCount: 0, budgetHint: null },
  ]);
  expect(await a.recentDemandItems(1)).toMatchObject([
    { sessionId: live.sessionId, source: 'live', event: 'other' },
  ]);
  expect(await a.demandItemsSince('2026-09-02')).toHaveLength(2);
  expect(
    await a.demandItemsSince('2026-09-02', { category: 'school-backpack' }),
  ).toEqual([]);
  await expect(a.recordDemandItems('missing', [])).rejects.toThrow();
  expect(today()).toBe('2026-09-02');
  vi.stubEnv('DEMO_TODAY', '2026-08-20');
  expect(today()).toBe('2026-08-20');
});
it('selects memory explicitly and refuses an unimplemented or unknown backend', () => {
  vi.stubEnv('KITLY_ADAPTER', 'memory');
  expect(getAdapter()).toBeInstanceOf(InMemoryAdapter);
  vi.stubEnv('KITLY_ADAPTER', 'supabase');
  expect(() => getAdapter()).toThrow(/not implemented/i);
  vi.stubEnv('KITLY_ADAPTER', 'typo');
  expect(() => getAdapter()).toThrow(/adapter/i);
});

it('listing updates cannot change commerce identity, price, stock, or delivery fields', async () => {
  const adapter = new InMemoryAdapter();
  const original = await adapter.getProduct('prod-minhan-backpack');
  if (!original) throw new Error('Missing fixture');
  // TypeScript structural typing allows a full Product to satisfy Pick<Product, ...>.
  const untrustedPatch = {
    ...original,
    id: 'replaced',
    shopId: 'shop-bago',
    price: 1,
    stock: 0,
    shipDaysMax: 99,
    title: original.title + ' Updated',
  };
  const updated = await adapter.updateListing(original.id, untrustedPatch);
  expect(updated).toMatchObject({
    id: 'prod-minhan-backpack',
    shopId: 'shop-minhan',
    price: 349000,
    stock: 120,
    shipDaysMax: 2,
    title: original.title + ' Updated',
  });
  expect(await adapter.getProduct(original.id)).toEqual(updated);
});
