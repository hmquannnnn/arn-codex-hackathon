import { enrichSchoolProducts } from './school';
import { categories, canonicalTags } from '../../src/contract/taxonomy';
import {
  productSchema,
  shopSchema,
  voucherSchema,
} from '../../src/contract/schemas';
import type {
  Product,
  Shop,
  Persona,
  Voucher,
  EventType,
} from '../../src/contract/types';
import shopFixtures from '../../src/contract/fixtures/shops.json';
import productFixtures from '../../src/contract/fixtures/products.json';
import voucherFixtures from '../../src/contract/fixtures/vouchers.json';

export function seedDate(today: string, offset: number): string {
  const date = new Date(`${today}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + offset);
  return date.toISOString();
}

export const eventShops: Record<
  Exclude<EventType, 'other'>,
  readonly [string, string]
> = {
  back_to_school: ['shop-minhan', 'shop-kidzone'],
  newborn: ['shop-kidzone', 'shop-babyhaven'],
  first_apartment: ['shop-homie', 'shop-nest'],
  camping_trip: ['shop-trailhead', 'shop-wildpath'],
  home_office: ['shop-deskpro', 'shop-workwell'],
  tet_gifts: ['shop-tetxinh', 'shop-lucky'],
};

function shops(): Shop[] {
  const extras: Shop[] = [
    ['babyhaven', 'Baby Haven', 'mall'],
    ['nest', 'Nest Home', 'mall'],
    ['wildpath', 'Wild Path', 'preferred'],
    ['workwell', 'Work Well', 'mall'],
    ['lucky', 'Lucky Gifts', 'mall'],
    ...Array.from({ length: 13 }, (_, i) => [
      `specialist-${i + 1}`,
      `${categories[i + 1].label} Studio`,
      i < 4 ? 'preferred' : 'regular',
    ]),
  ].map(([id, name, tier], i) =>
    shopSchema.parse({
      id: `shop-${id}`,
      name,
      tier,
      rating: 4.6,
      shipFee: 15000 + (i % 5) * 5000,
      city: ['Hanoi', 'HCMC', 'Da Nang'][i % 3],
    }),
  );
  return [...shopFixtures.map((s) => shopSchema.parse(s)), ...extras];
}

// Literal Vietnam market baselines keep emergency depth fills affordable and deterministic.
const basePrices: Record<string, number> = {
  notebooks: 35000,
  'pencils-pens': 25000,
  'pencil-case': 45000,
  'crayons-paints': 55000,
  'water-bottle': 85000,
  'lunch-box': 95000,
  'school-shoes': 140000,
  'uniform-shirt': 95000,
  'book-covers': 25000,
  'kids-desk-lamp': 180000,
  diapers: 180000,
  'baby-bottles': 120000,
  swaddles: 90000,
  'baby-clothes': 95000,
  'baby-bathtub': 180000,
  stroller: 950000,
  'baby-carrier': 320000,
  'breast-pump': 450000,
  'baby-wipes': 35000,
  'baby-thermometer': 120000,
  'rice-cooker': 450000,
  'bedding-set': 350000,
  pillow: 90000,
  'storage-boxes': 80000,
  'desk-fan': 180000,
  'cookware-set': 380000,
  'dish-rack': 140000,
  hangers: 35000,
  'power-strip': 90000,
  curtains: 200000,
  tent: 900000,
  'sleeping-bag': 320000,
  'camping-stove': 250000,
  'cooler-box': 280000,
  headlamp: 95000,
  sunscreen: 150000,
  'beach-towel': 90000,
  'dry-bag': 85000,
  'insect-repellent': 55000,
  'folding-chair': 180000,
  'office-chair': 650000,
  desk: 550000,
  monitor: 1800000,
  'monitor-arm': 250000,
  keyboard: 180000,
  mouse: 95000,
  webcam: 220000,
  'laptop-stand': 120000,
  headset: 180000,
  'desk-lamp': 140000,
  'tea-gift-box': 150000,
  'dried-fruit-box': 120000,
  wine: 220000,
  'bird-nest-gift': 450000,
  'cookie-tin': 95000,
  'red-envelopes': 15000,
  'gift-basket': 250000,
  'coffee-gift-set': 150000,
};
const forbidden = new Set([
  'anti-hunchback',
  'anti-blue-light',
  'backpack-cover',
]);

export interface SeedCatalog {
  shops: Shop[];
  products: Product[];
  vouchers: Voucher[];
  personas: Persona[];
}

/** Normalization is pure: callers can verify the exact world before writing to any database. */
export function buildCatalog(generated: Product[], today: string): SeedCatalog {
  const allShops = shops();
  const products: Product[] = [];
  for (const [categoryIndex, category] of categories.entries()) {
    if (['school-backpack', 'kids-raincoat'].includes(category.id)) continue;
    const pair = eventShops[category.event];
    const specialist =
      categoryIndex >= 1 && categoryIndex <= 13
        ? `shop-specialist-${categoryIndex}`
        : 'shop-homie' === pair[0]
          ? 'shop-deskpro'
          : 'shop-homie';
    const primary =
      category.event === 'back_to_school' && categoryIndex >= 8
        ? 'shop-homie'
        : pair[0];
    const assigned = [primary, specialist, primary, primary, pair[1], pair[1]];
    const input = generated
      .filter((p) => p.category === category.id)
      .sort((a, b) => a.price - b.price)
      .slice(0, 6);
    const baseline = basePrices[category.id];
    const group = Array.from({ length: 6 }, (_, i): Product => {
      const supplied: Partial<Product> = input[i] ?? {};
      const price =
        Math.round((baseline * [1, 1.2, 1.65, 1.9, 2.8, 3.4][i]) / 1000) * 1000;
      return productSchema.parse({
        id: `prod-${category.id}-${i + 1}`,
        shopId: assigned[i],
        title: `${category.label} ${['Essential', 'Daily', 'Comfort', 'Select', 'Premium', 'Signature'][i]}`,
        description: `${category.label} for everyday use. Supplied as one retail unit with care instructions.`,
        category: category.id,
        price,
        rating: i >= 4 ? 4.9 : 4.3 + i * 0.1,
        reviewCount: 100 + i * 120,
        soldCount: 500 + i * 250,
        stock: 100,
        tags: [],
        attributes: { pack: '1 unit', edition: '2026' },
        shipDaysMin: 1,
        shipDaysMax: 3,
        updatedForDemandAt: null,
        ...supplied,
        // Ids and shops are code-owned, so no accidental collision or outside-shop reference survives.
        ...(supplied
          ? { id: `prod-${category.id}-${i + 1}`, shopId: assigned[i] }
          : {}),
      });
    });
    for (const [i, product] of group.entries()) {
      product.tags = [
        ...new Set(
          product.tags
            .filter(
              (t) =>
                canonicalTags.includes(t as (typeof canonicalTags)[number]) &&
                !forbidden.has(t) &&
                t !== 'budget' &&
                t !== 'premium',
            )
            .concat(i < 2 ? ['budget'] : i >= 4 ? ['premium'] : []),
        ),
      ];
      if (i < 5) {
        product.stock = Math.max(1, product.stock);
        product.shipDaysMax = Math.min(3, product.shipDaysMax);
        product.shipDaysMin = Math.min(
          product.shipDaysMin,
          product.shipDaysMax,
        );
      }
    }
    const timely = group
      .filter((p) => p.stock > 0 && p.shipDaysMax <= 3)
      .sort((a, b) => a.price - b.price);
    const highest = timely.at(-1)!;
    highest.price = Math.max(highest.price, Math.ceil(timely[0].price * 2.5));
    highest.rating = Math.max(4.8, highest.rating);
    const stocked = group.filter((p) => p.stock > 0);
    const cheapest = [...stocked].sort((a, b) => a.price - b.price)[0];
    const best = [...stocked].sort((a, b) => b.rating - a.rating)[0];
    for (const p of [cheapest, best]) {
      p.shipDaysMin = 1;
      p.shipDaysMax = Math.min(2, p.shipDaysMax);
    }
    products.push(...group);
  }
  products.push(
    ...productFixtures
      .filter((p) => p.category === 'school-backpack')
      .map((p) => productSchema.parse(p)),
  );
  const rain = productFixtures.find((p) => p.category === 'kids-raincoat')!;
  products.push(
    ...Array.from({ length: 4 }, (_, i) =>
      productSchema.parse({
        ...rain,
        id: i === 0 ? rain.id : `prod-plain-raincoat-${i + 1}`,
        shopId: [
          'shop-homie',
          'shop-kidzone',
          'shop-specialist-9',
          'shop-deskpro',
        ][i],
        title: [
          'Homie Plain Kids Raincoat',
          'KidZone Plain Kids Raincoat',
          'Rain Studio Kids Raincoat',
          'DeskPro Plain Kids Raincoat',
        ][i],
        price: 75000 + i * 25000,
        tags: ['kids', 'waterproof'],
        attributes: { material: 'EVA', size: '6–8 years' },
        description:
          'Plain EVA raincoat sized for children aged 6–8. Snap fasteners and a drawstring hood keep school uniforms dry.',
      }),
    ),
  );
  const vouchers = voucherFixtures.map((v) =>
    voucherSchema.parse({
      ...v,
      validUntil: seedDate(today, v.code === 'LAN-BTS10' ? 2 : 28).slice(0, 10),
    }),
  );
  const personas: Persona[] = [
    {
      id: 'lan',
      name: 'Lan',
      address: { district: 'Cau Giay', city: 'Hanoi' },
      favoriteShopIds: ['shop-kidzone'],
      cart: [
        {
          productId: 'prod-kidzone-lite-backpack',
          addedAt: seedDate(today, -14),
        },
      ],
    },
  ];
  return {
    shops: allShops,
    products: enrichSchoolProducts(products),
    vouchers,
    personas,
  };
}
