import { describe, it, expect } from 'vitest';
import { buildCatalog } from '../../scripts/seed/catalog';
import { categories } from '../../src/contract/taxonomy';
import { productSchema } from '../../src/contract/schemas';

describe('seed catalog public generator', () => {
  it('repairs sparse catalog depth while preserving the exact planted demo facts', () => {
    const world = buildCatalog([], '2026-10-01');
    expect(world.shops).toHaveLength(25);
    expect(
      new Set(
        world.products
          .filter((p) => p.shopId === 'shop-minhan')
          .map((p) => p.category),
      ).size,
    ).toBe(8);
    expect(
      ['mall', 'preferred', 'regular'].map(
        (t) => world.shops.filter((s) => s.tier === t).length,
      ),
    ).toEqual([6, 8, 11]);
    expect(
      world.products.every((p) => productSchema.safeParse(p).success),
    ).toBe(true);
    for (const category of categories.filter(
      (c) => !['school-backpack', 'kids-raincoat'].includes(c.id),
    )) {
      const products = world.products.filter((p) => p.category === category.id);
      expect(
        new Set(products.map((p) => p.shopId)).size,
      ).toBeGreaterThanOrEqual(3);
      const timely = products
        .filter((p) => p.stock > 0 && p.shipDaysMax <= 3)
        .sort((a, b) => a.price - b.price);
      expect(timely.length).toBeGreaterThanOrEqual(5);
      expect(timely.at(-1)!.price / timely[0].price).toBeGreaterThanOrEqual(
        2.5,
      );
      expect(
        timely
          .slice(Math.floor((timely.length * 2) / 3))
          .some(
            (p) =>
              p.rating >= 4.8 ||
              world.shops.find((s) => s.id === p.shopId)!.tier === 'mall',
          ),
      ).toBe(true);
      const stocked = products.filter((p) => p.stock > 0);
      expect(
        [...stocked].sort((a, b) => a.price - b.price)[0].shipDaysMax,
      ).toBeLessThanOrEqual(2);
      expect(
        [...stocked].sort((a, b) => b.rating - a.rating)[0].shipDaysMax,
      ).toBeLessThanOrEqual(2);
    }
    expect(
      world.products.filter((p) => p.category === 'kids-raincoat'),
    ).toHaveLength(4);
    expect(
      world.products.filter((p) => p.tags.includes('anti-hunchback')),
    ).toHaveLength(1);
    expect(
      world.products.some((p) =>
        p.tags.some((t) => ['backpack-cover', 'anti-blue-light'].includes(t)),
      ),
    ).toBe(false);
    expect(
      world.products.find((p) => p.id === 'prod-minhan-backpack')?.tags,
    ).toEqual(['kids']);
    expect(world.personas[0].cart).toEqual([
      {
        productId: 'prod-kidzone-lite-backpack',
        addedAt: '2026-09-17T00:00:00.000Z',
      },
    ]);
    expect(world.vouchers.find((v) => v.code === 'LAN-BTS10')?.validUntil).toBe(
      '2026-10-03',
    );
  });
});

import { generateDemand } from '../../scripts/seed/demand';
import { demandItemRowSchema, kitPlanSchema } from '../../src/contract/schemas';

describe('seed demand public generator', () => {
  it('produces deterministic distinct-session gaps, robust exact percentiles and school combos', () => {
    const world = buildCatalog([], '2026-09-02');
    const history = generateDemand(world.products, '2026-09-02');
    expect(history).toEqual(generateDemand(world.products, '2026-09-02'));
    expect(history.sessions.length).toBeGreaterThanOrEqual(1500);
    expect(history.sessions.length).toBeLessThanOrEqual(1700);
    expect(
      history.sessions.every(
        (s) =>
          kitPlanSchema.safeParse(s.plan).success &&
          s.plan.items.length >= 6 &&
          s.plan.items.length <= 10,
      ),
    ).toBe(true);
    expect(
      history.demandItems.every(
        (d) => demandItemRowSchema.safeParse(d).success,
      ),
    ).toBe(true);
    const cases = [
      ['school-backpack', 'anti-hunchback', 37, 21, 300000, 400000],
      ['kids-raincoat', 'backpack-cover', 52, 30, 120000, 180000],
      ['kids-desk-lamp', 'anti-blue-light', 18, 15, 250000, 400000],
      [null, null, 9, 4, null, null],
    ] as const;
    for (const [category, tag, now, before, lo, hi] of cases) {
      for (const [start, end, count] of [
        ['2026-08-27', '2026-09-03', now],
        ['2026-08-20', '2026-08-27', before],
      ] as const) {
        const rows = history.demandItems.filter(
          (r) =>
            r.category === category &&
            (!tag || r.tags.includes(tag)) &&
            r.createdAt >= start &&
            r.createdAt < end,
        );
        expect(new Set(rows.map((r) => r.sessionId)).size).toBe(count);
        if (lo !== null && hi !== null) {
          for (const hints of [
            rows.map((r) => r.budgetHint!),
            [...rows.map((r) => r.budgetHint!), hi],
          ]) {
            hints.sort((a, b) => a - b);
            for (const [fraction, expected] of [
              [0.25, lo],
              [0.75, hi],
            ]) {
              const position = (hints.length - 1) * fraction;
              expect(hints[Math.floor(position)]).toBe(expected);
              expect(hints[Math.ceil(position)]).toBe(expected);
            }
          }
        }
      }
    }
    const school = history.sessions.filter((s) => s.event === 'back_to_school');
    expect(
      school.filter((s) =>
        ['school-backpack', 'water-bottle', 'lunch-box'].every((c) =>
          s.plan.items.some((i) => i.category === c),
        ),
      ).length / school.length,
    ).toBeGreaterThanOrEqual(0.6);
    const gap = history.demandItems.find((d) =>
      d.tags.includes('anti-hunchback'),
    )!;
    expect(gap.matchedCount).toBe(0);
    expect(
      history.demandItems.find((d) => d.category === 'notebooks')!.matchedCount,
    ).toBeGreaterThan(0);
  });
});

import { generateCatalog } from '../../scripts/seed/generate';
import { FakeLLM } from '../../src/server/llm/fake';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

it('generates each category through the LLM schema and reuses the validated disk cache', async () => {
  const cacheDir = await mkdtemp(join(tmpdir(), 'kitly-seed-'));
  const output = {
    products: Array.from({ length: 6 }, (_, i) => ({
      title: `A5 Notebook ${i + 1}`,
      description:
        'A5 notebook with 100 sheets of 80 gsm paper. Stapled spine opens flat for writing.',
      price: 35000 + i * 20000,
      rating: 4.5,
      reviewCount: 125,
      soldCount: 550,
      stock: 100,
      shipDaysMin: 1,
      shipDaysMax: 3,
      tags: ['eco-friendly'],
      priceTier: i < 2 ? 'budget' : i < 4 ? 'mid' : 'premium',
      attributes: [
        { key: 'paper', value: '80 gsm' },
        { key: 'sheets', value: '100' },
      ],
    })),
  };
  try {
    const llm = new FakeLLM([output]);
    const selected = categories.filter((c) => c.id === 'notebooks');
    const generated = await generateCatalog(llm, {
      cacheDir,
      categories: selected,
      model: 'test-fast',
      effort: 'low',
    });
    expect(generated).toHaveLength(6);
    expect(generated[0].category).toBe('notebooks');
    expect(generated[0].attributes).toEqual({ paper: '80 gsm', sheets: '100' });
    expect(llm.calls).toHaveLength(1);
    expect(llm.calls[0].effort).toBe('low');
    const cachedLLM = new FakeLLM();
    expect(
      await generateCatalog(cachedLLM, {
        cacheDir,
        categories: selected,
        model: 'test-fast',
        effort: 'low',
      }),
    ).toEqual(generated);
    expect(cachedLLM.calls).toHaveLength(0);
    const catalog = buildCatalog(generated, '2026-09-02');
    expect(
      catalog.products
        .filter((p) => p.category === 'notebooks')
        .map((p) => p.title),
    ).toEqual(output.products.map((p) => p.title));
  } finally {
    await rm(cacheDir, { recursive: true, force: true });
  }
});

it('repairs adversarial generated stock, shipping and gap tags without changing the source data', () => {
  const baseline = buildCatalog([], '2026-09-02');
  const generated = baseline.products
    .filter((p) => p.category === 'water-bottle')
    .map((p) => ({
      ...p,
      price: 100000,
      stock: 0,
      shipDaysMin: 7,
      shipDaysMax: 9,
      rating: 4,
      tags: ['backpack-cover', 'anti-blue-light', 'anti-hunchback', 'bpa-free'],
    }));
  const before = structuredClone(generated);
  const catalog = buildCatalog(generated, '2026-09-02');
  expect(generated).toEqual(before);
  const repaired = catalog.products.filter(
    (p) => p.category === 'water-bottle',
  );
  const timely = repaired
    .filter((p) => p.stock > 0 && p.shipDaysMax <= 3)
    .sort((a, b) => a.price - b.price);
  expect(timely).toHaveLength(5);
  expect(timely.at(-1)!.price).toBeGreaterThanOrEqual(timely[0].price * 2.5);
  expect(
    timely.every(
      (p) =>
        p.tags.includes('bpa-free') &&
        !p.tags.some((t) =>
          ['backpack-cover', 'anti-blue-light', 'anti-hunchback'].includes(t),
        ),
    ),
  ).toBe(true);
  expect(
    timely.filter((p) => p.shipDaysMax <= 2).length,
  ).toBeGreaterThanOrEqual(2);
});

it('keeps an affordable express hero kit and exactly one closest backpack', () => {
  const catalog = buildCatalog([], '2026-09-02');
  const heroCategories = [
    'notebooks',
    'pencils-pens',
    'pencil-case',
    'crayons-paints',
    'water-bottle',
    'lunch-box',
    'school-shoes',
    'uniform-shirt',
    'kids-raincoat',
    'book-covers',
  ];
  const cheapest = heroCategories.map(
    (category) =>
      catalog.products
        .filter(
          (p) => p.category === category && p.stock > 0 && p.shipDaysMax <= 2,
        )
        .sort((a, b) => a.price - b.price)[0],
  );
  const closest = catalog.products.filter(
    (p) =>
      p.category === 'school-backpack' &&
      p.price <= 400000 &&
      p.stock > 0 &&
      p.shipDaysMax <= 2,
  );
  expect(closest.map((p) => p.id)).toEqual(['prod-minhan-backpack']);
  const withBackpack = [...cheapest, ...closest];
  const subtotal = withBackpack.reduce((total, p) => total + p.price, 0);
  const shipping = [...new Set(withBackpack.map((p) => p.shopId))].reduce(
    (total, id) => total + catalog.shops.find((s) => s.id === id)!.shipFee,
    0,
  );
  expect(subtotal + shipping).toBeLessThanOrEqual(1500000);
});
