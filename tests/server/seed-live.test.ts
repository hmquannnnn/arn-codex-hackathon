import { describe, expect, it } from 'vitest';
import { SupabaseAdapter } from '../../src/server/commerce/supabase';
import { categories } from '../../src/contract/taxonomy';
import { seedDate } from '../../scripts/seed/catalog';

// Read-only verification: the runner owns reset/loading, this suite only uses CommerceAdapter.
describe.skipIf(!process.env.SUPABASE_URL)('seeded Supabase catalog', () => {
  it('serves all category depth/express guarantees and every planted demo invariant', async () => {
    const adapter = new SupabaseAdapter();
    const [products, shops, lan, vouchers] = await Promise.all([
      adapter.searchProducts({}),
      adapter.listShops(),
      adapter.getPersona('lan'),
      adapter.listVouchers('lan'),
    ]);
    expect(shops).toHaveLength(25);
    expect(
      ['mall', 'preferred', 'regular'].map(
        (tier) => shops.filter((s) => s.tier === tier).length,
      ),
    ).toEqual([6, 8, 11]);
    expect(products.length).toBeGreaterThanOrEqual(350);
    expect(
      new Set(
        products
          .filter((p) => p.shopId === 'shop-minhan')
          .map((p) => p.category),
      ).size,
    ).toBe(8);
    for (const category of categories.filter(
      (c) => !['school-backpack', 'kids-raincoat'].includes(c.id),
    )) {
      const group = products.filter((p) => p.category === category.id);
      expect(
        new Set(group.map((p) => p.shopId)).size,
        category.id,
      ).toBeGreaterThanOrEqual(3);
      const stocked = group.filter((p) => p.stock > 0);
      const timely = stocked
        .filter((p) => p.shipDaysMax <= 3)
        .sort((a, b) => a.price - b.price);
      expect(timely.length, category.id).toBeGreaterThanOrEqual(5);
      expect(
        timely.at(-1)!.price / timely[0].price,
        category.id,
      ).toBeGreaterThanOrEqual(2.5);
      expect(
        timely
          .slice(Math.floor((timely.length * 2) / 3))
          .some(
            (p) =>
              p.rating >= 4.8 ||
              shops.find((s) => s.id === p.shopId)!.tier === 'mall',
          ),
        category.id,
      ).toBe(true);
      expect(
        [...stocked].sort((a, b) => a.price - b.price)[0].shipDaysMax,
        category.id,
      ).toBeLessThanOrEqual(2);
      expect(
        [...stocked].sort((a, b) => b.rating - a.rating)[0].shipDaysMax,
        category.id,
      ).toBeLessThanOrEqual(2);
    }
    expect(
      products
        .filter((p) => p.tags.includes('anti-hunchback'))
        .map((p) => p.id),
    ).toEqual(['prod-kidzone-ergo-backpack']);
    expect(
      products.some(
        (p) =>
          p.tags.includes('backpack-cover') ||
          p.tags.includes('anti-blue-light'),
      ),
    ).toBe(false);
    expect(products.filter((p) => p.category === 'kids-raincoat')).toHaveLength(
      4,
    );
    expect(
      products
        .filter(
          (p) =>
            p.category === 'school-backpack' &&
            p.stock > 0 &&
            p.price <= 400000 &&
            p.shipDaysMax <= 3,
        )
        .map((p) => p.id),
    ).toEqual(['prod-minhan-backpack']);
    const today = process.env.DEMO_TODAY || '2026-09-02';
    // The live buyer can save more products; seed.test.ts verifies the exact initial cart.
    expect(lan.cart).toEqual(
      expect.arrayContaining([
        {
          productId: 'prod-kidzone-lite-backpack',
          addedAt: seedDate(today, -14),
        },
      ]),
    );
    expect(new Set(lan.cart.map((line) => line.productId)).size).toBe(
      lan.cart.length,
    );
    expect(
      lan.cart.every((line) =>
        products.some((product) => product.id === line.productId),
      ),
    ).toBe(true);
    expect(vouchers.filter((v) => v.ownerPersona === null)).toHaveLength(8);
    expect(vouchers.filter((v) => v.ownerPersona === 'lan')).toHaveLength(2);
    expect(vouchers.find((v) => v.code === 'LAN-BTS10')?.validUntil).toBe(
      seedDate(today, 2).slice(0, 10),
    );
    expect(vouchers.find((v) => v.code === 'LAN-KZ80')?.validUntil).toBe(
      seedDate(today, 28).slice(0, 10),
    );
  }, 30000);
});
