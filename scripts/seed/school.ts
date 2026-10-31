import { categories } from '../../src/contract/taxonomy';
import type { Product } from '../../src/contract/types';

const schoolCategories = new Set<string>(
  categories.filter((c) => c.event === 'back_to_school').map((c) => c.id),
);
const keyOf = (key: string) =>
  key
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_|_$/g, '');

/** Values stay strings to honour Product.attributes; numeric keys specify their unit. */
export function normalizeSchoolAttributes(
  input: Product['attributes'],
): Product['attributes'] {
  const result: Product['attributes'] = {};
  for (const [rawKey, value] of Object.entries(input)) {
    let key = keyOf(rawKey);
    let normalized = value;
    const numeric = value.trim().match(/^(\d+(?:\.\d+)?)\s*(ml|l|g|kg)$/i);
    if (['capacity', 'volume', 'weight'].includes(key) && numeric) {
      const unit = numeric[2].toLowerCase();
      if (key === 'weight' && ['g', 'kg'].includes(unit)) {
        key = 'weight_g';
        normalized = String(Number(numeric[1]) * (unit === 'kg' ? 1000 : 1));
      } else if (key !== 'weight' && ['ml', 'l'].includes(unit)) {
        key = 'capacity_ml';
        normalized = String(Number(numeric[1]) * (unit === 'l' ? 1000 : 1));
      }
    }
    // Keep differing aliases rather than silently discarding a source specification.
    if (result[key] !== undefined && result[key] !== normalized) {
      result[`${key}_source_${Object.keys(result).length}`] = normalized;
    } else result[key] = normalized;
  }
  return result;
}

// Curated, fictional demo variants. Index is a stable product-id suffix, never price rank.
const colors = ['blue', 'pink', 'black', 'green', 'purple', 'orange'];
const styles = [
  'sporty',
  'cartoon',
  'minimalist',
  'sporty',
  'minimalist',
  'cartoon',
];
const backpacks: Record<string, [string, string, string, string, string]> = {
  'prod-bago-backpack-1': ['Bago', 'blue', 'sporty', '850', '16'],
  'prod-bago-backpack-2': ['Bago', 'pink', 'cartoon', '780', '14'],
  'prod-bago-backpack-3': ['Bago', 'black', 'minimalist', '900', '20'],
  'prod-minhan-backpack': ['Minh An', 'green', 'minimalist', '750', '16'],
  'prod-homie-backpack': ['Homie', 'purple', 'cartoon', '650', '18'],
  'prod-kidzone-lite-backpack': ['KidZone', 'blue', 'sporty', '600', '15'],
  'prod-kidzone-ergo-backpack': [
    'KidZone',
    'orange',
    'minimalist',
    '950',
    '18',
  ],
};

function curatedAttributes(p: Product): Product['attributes'] {
  const backpack = backpacks[p.id];
  if (p.category === 'school-backpack' && backpack) {
    const [brand, color, style, weight_g, capacity_l] = backpack;
    return {
      material: p.id === 'prod-homie-backpack' ? 'nylon' : 'polyester',
      brand,
      color,
      style,
      weight_g,
      capacity_ml: String(Number(capacity_l) * 1000),
      age_min: '6',
      age_max: p.id === 'prod-kidzone-lite-backpack' ? '9' : '8',
    };
  }
  const match = p.id.match(/^prod-(water-bottle|lunch-box|school-shoes)-(\d)$/);
  if (!match) return {};
  const i = Number(match[2]) - 1;
  if (i < 0 || i >= colors.length) return {};
  const common = {
    color: colors[i],
    style: styles[i],
    brand: p.title.split(' ')[0],
  };
  if (p.category === 'water-bottle')
    return {
      ...common,
      capacity_ml: ['500', '600', '550', '700', '650', '750'][i],
      weight_g: ['140', '160', '310', '180', '360', '390'][i],
    };
  if (p.category === 'lunch-box')
    return {
      ...common,
      capacity_ml: ['700', '900', '1200', '1000', '1100', '1300'][i],
      weight_g: ['180', '240', '210', '320', '650', '780'][i],
    };
  // A retail size range is coverage, not evidence that every size is currently stocked.
  return {
    ...common,
    size_system: 'EU',
    size_range: '28-35',
    weight_g: ['300', '390', '340', '280', '440', '370'][i],
    weight_basis: 'pair at EU 30',
  };
}

export function enrichSchoolProducts(products: Product[]): Product[] {
  return products.map((p) => {
    if (!schoolCategories.has(p.category)) return p;
    const original = normalizeSchoolAttributes(p.attributes);
    const curated = curatedAttributes(p);
    if (original.material === 'mixed' && curated.material)
      delete original.material;
    const attributes = { ...curated, ...original };
    const tags = [...p.tags];
    // Preserve the exact planted listing gap, including its intentionally sparse tags.
    if (
      p.id !== 'prod-minhan-backpack' &&
      curated.style &&
      !tags.includes(curated.style)
    )
      tags.push(curated.style);
    // Expose new mock facts in the description too, so tags and visible specs agree.
    const marker = '\nDemo variant specifications: ';
    const description =
      Object.keys(curated).length && p.id !== 'prod-minhan-backpack'
        ? p.description.split(marker)[0] +
          marker +
          Object.entries(attributes)
            .sort(([a], [b]) => a.localeCompare(b))
            .map(([k, v]) => `${k}=${v}`)
            .join('; ') +
          '.'
        : p.description;
    return { ...p, attributes, tags, description };
  });
}
