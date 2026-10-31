import { describe, expect, it } from 'vitest';
import { buildCatalog } from '../../scripts/seed/catalog';
import {
  enrichSchoolProducts,
  normalizeSchoolAttributes,
} from '../../scripts/seed/school';
import fixtures from '../../src/contract/fixtures/products.json';
import { productSchema } from '../../src/contract/schemas';
import { canonicalTags } from '../../src/contract/taxonomy';

describe('school catalog preparation', () => {
  it('normalizes units and aliases without losing specs or changing other categories', () => {
    const products = buildCatalog([], '2026-09-02').products;
    const bottle = products.find((p) => p.id === 'prod-water-bottle-1')!;
    bottle.attributes = {
      Capacity: '1.2 L',
      Material: 'Steel',
      Weight: '0.6 kg',
      'Special feature': 'Carry loop',
    };
    const result = enrichSchoolProducts(products);
    expect(result.find((p) => p.id === bottle.id)!.attributes).toMatchObject({
      capacity_ml: '1200',
      weight_g: '600',
      material: 'Steel',
      special_feature: 'Carry loop',
    });
    expect(result.filter((p) => p.category === 'diapers')).toEqual(
      products.filter((p) => p.category === 'diapers'),
    );
    expect(bottle.attributes).toHaveProperty('Capacity');
    expect(enrichSchoolProducts(result)).toEqual(result);
  });
  it('preserves distinct alias values and is stable after JSONB reorders keys', () => {
    expect(
      normalizeSchoolAttributes({ Material: 'Steel', material: 'Silicone' }),
    ).toMatchObject({ material: 'Steel', material_source_1: 'Silicone' });
    const products = buildCatalog([], '2026-09-02').products;
    const reordered = products.map((p) => ({
      ...p,
      attributes: Object.fromEntries(Object.entries(p.attributes).reverse()),
    }));
    expect(enrichSchoolProducts(reordered)).toEqual(products);
    const original = fixtures
      .filter((p) => p.category === 'school-backpack')
      .map((p) => productSchema.parse(p));
    const enriched = enrichSchoolProducts(original);
    for (const [i, p] of enriched.entries()) {
      expect({
        ...p,
        attributes: original[i].attributes,
        tags: original[i].tags,
        description: original[i].description,
      }).toEqual(original[i]);
    }
  });
  it('provides comparable school choices while preserving prices, shipping, identity and demo gaps', () => {
    const world = buildCatalog([], '2026-09-02');
    const enriched = enrichSchoolProducts(world.products);
    for (const category of [
      'school-backpack',
      'water-bottle',
      'lunch-box',
      'school-shoes',
    ]) {
      const group = enriched.filter((p) => p.category === category);
      expect(
        new Set(group.map((p) => p.attributes.color)).size,
      ).toBeGreaterThan(1);
      for (const p of group) {
        expect(p.attributes).toMatchObject({
          color: expect.any(String),
          style: expect.any(String),
          brand: expect.any(String),
        });
        expect(
          Object.keys(p.attributes).every((k) => /^[a-z][a-z0-9_]*$/.test(k)),
        ).toBe(true);
        expect(
          p.tags.every((t) => (canonicalTags as readonly string[]).includes(t)),
        ).toBe(true);
        const original = world.products.find((o) => o.id === p.id)!;
        expect([p.price, p.shopId, p.stock, p.shipDaysMax]).toEqual([
          original.price,
          original.shopId,
          original.stock,
          original.shipDaysMax,
        ]);
      }
    }
    expect(
      enriched.filter((p) => p.tags.includes('anti-hunchback')),
    ).toHaveLength(1);
    expect(
      enriched.some(
        (p) =>
          p.tags.includes('backpack-cover') ||
          p.tags.includes('anti-blue-light'),
      ),
    ).toBe(false);
    expect(enriched.find((p) => p.id === 'prod-minhan-backpack')!.tags).toEqual(
      ['kids'],
    );
    expect(
      enriched.find((p) => p.id === 'prod-kidzone-lite-backpack')!.attributes
        .weight_g,
    ).toBe('600');
  });
});
