import { describe, expect, it } from 'vitest';
import { productSchema } from '@/contract/schemas';

describe('public product contract', () => {
  it('accepts the planted hero listing and rejects incomplete products', () => {
    const hero = {
      id: 'prod-minhan-backpack',
      shopId: 'shop-minhan',
      title: 'Minh An Kids Backpack New Model 2026',
      category: 'school-backpack',
      description:
        'Padded ergonomic back panel with S-shaped straps that keep the spine straight. Weighs only 0.75 kg. Water-resistant fabric. Sized for children aged 6–8.',
      price: 349000,
      rating: 4.8,
      reviewCount: 412,
      soldCount: 1930,
      stock: 120,
      tags: ['kids'],
      attributes: { material: 'polyester' },
      shipDaysMin: 1,
      shipDaysMax: 2,
      updatedForDemandAt: null,
    };
    expect(productSchema.parse(hero)).toEqual(hero);
    expect(productSchema.safeParse({ id: 'incomplete' }).success).toBe(false);
    expect(productSchema.safeParse({ ...hero, price: -1 }).success).toBe(false);
  });
});

import { readFileSync } from 'node:fs';
import { z } from 'zod';
import {
  basketOptionSchema,
  demandItemRowSchema,
  kitEventSchema,
  personaSchema,
  shopSchema,
  threadResponseSchema,
  voucherSchema,
} from '@/contract/schemas';
import { categories, canonicalTags } from '@/contract/taxonomy';
const fixture = (name: string) =>
  JSON.parse(readFileSync(`src/contract/fixtures/${name}`, 'utf8'));

it('publishes complete, parseable catalog and persona fixtures for Lane 2', () => {
  expect(
    z.array(shopSchema).parse(fixture('shops.json')).length,
  ).toBeGreaterThanOrEqual(6);
  const products = z.array(productSchema).parse(fixture('products.json'));
  expect(products.length).toBeGreaterThanOrEqual(30);
  expect(products.find((p) => p.id === 'prod-minhan-backpack')).toMatchObject({
    price: 349000,
    tags: ['kids'],
    shipDaysMin: 1,
    shipDaysMax: 2,
  });
  expect(z.array(voucherSchema).parse(fixture('vouchers.json'))).toHaveLength(
    10,
  );
  expect(
    z.array(personaSchema).parse(fixture('personas.json'))[0],
  ).toMatchObject({ id: 'lan', favoriteShopIds: ['shop-kidzone'] });
  expect(
    z.array(demandItemRowSchema).parse(fixture('demand.json')).length,
  ).toBeGreaterThanOrEqual(60);
  expect(categories).toHaveLength(60);
  expect(new Set(categories.map((c) => c.id)).size).toBe(60);
  expect(canonicalTags).toContain('anti-hunchback');
  for (const product of products)
    expect(categories.some((c) => c.id === product.category)).toBe(true);
});
it('ships a coherent hero stream, clarify, answer, history and fit suggestions', () => {
  for (const name of [
    'kit.sample.json',
    'kit.clarify.sample.json',
    'kit.answer.sample.json',
  ]) {
    const stream = z.array(kitEventSchema).parse(fixture(name));
    expect(stream.at(-1)?.event).toBe('done');
  }
  const hero = z.array(kitEventSchema).parse(fixture('kit.sample.json'));
  const options = hero.find((e) => e.event === 'options');
  if (options?.event !== 'options') throw new Error('Missing options');
  expect(options.data.options).toHaveLength(3);
  for (const option of options.data.options) {
    expect(option.grandTotal).toBeLessThanOrEqual(1500000);
    expect(
      option.itemsTotal + option.shippingTotal - option.discountTotal,
    ).toBe(option.grandTotal);
    expect(option.savings.reduce((n, s) => n + s.amount, 0)).toBe(
      option.discountTotal,
    );
    expect(option.noMatch[0].closest?.candidate.product.id).toBe(
      'prod-minhan-backpack',
    );
  }
  expect(options.data.options[1].interests?.[0]).toMatchObject({
    priceAfterVoucher: 440000,
    overMaxPriceBy: 40000,
  });
  expect(options.data.options[1].savings.some((s) => s.wallet)).toBe(true);
  expect(hero.some((e) => e.event === 'followup')).toBe(true);
  const threads = z
    .array(threadResponseSchema)
    .parse(fixture('threads.sample.json'));
  expect(threads).toHaveLength(2);
  expect(threads[0].versions.map((v) => v.version)).toEqual([1, 2]);
  expect(threads[0].messages).toHaveLength(1);
  expect(threads[1].versions[0].status).toBe('awaiting_budget');
  const over = basketOptionSchema.parse(fixture('kit.over-budget.sample.json'));
  expect(over.status).toBe('over_budget');
  expect(over.fit).toHaveLength(2);
});
