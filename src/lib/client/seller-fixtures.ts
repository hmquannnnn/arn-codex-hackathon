import type {
  InsightsResponse,
  EnrichmentPreviewResponse,
} from '@/contract/types';
import { productSchema } from '@/contract/schemas';
import products from '@/contract/fixtures/products.json';
const before = productSchema.parse(
  products.find((p) => p.id === 'prod-minhan-backpack'),
);
export const previewFixture: EnrichmentPreviewResponse = {
  proposalId: 'fixture-backpack-enrichment',
  before,
  after: {
    ...before,
    title: before.title + ' · Anti-hunchback, lightweight',
    tags: [...before.tags, 'anti-hunchback', 'lightweight', 'grade-1'],
    attributes: { ...before.attributes, ergonomic: 'S-shaped straps' },
    description: before.description + ' Ergonomic support for Grade 1.',
  },
  added: {
    titleSuffix: ' · Anti-hunchback, lightweight',
    tags: ['anti-hunchback', 'lightweight', 'grade-1'],
    attributes: { ergonomic: 'S-shaped straps' },
    descriptionAppend: 'Ergonomic support for Grade 1.',
  },
  kept: { title: before.title, tags: before.tags },
  keywordCheck: before.title
    .split(' ')
    .map((keyword) => ({ keyword, stillMatches: true })),
  evidence: 'S-shaped straps that keep the spine straight.',
};
export const insightsFixture: InsightsResponse = {
  window: {
    today: '2026-09-02',
    thisWeekFrom: '2026-08-27',
    lastWeekFrom: '2026-08-20',
  },
  gaps: [
    {
      key: 'school-backpack|anti-hunchback',
      type: 'listing_gap',
      needLabel: 'Anti-hunchback backpack',
      category: 'school-backpack',
      tags: ['anti-hunchback'],
      thisWeek: 37,
      lastWeek: 21,
      matchingProducts: 0,
      priceBand: { p25: 300000, p75: 400000 },
      neededWith: [{ category: 'water-bottle', share: 0.7 }],
      advice:
        'Update Minh An Kids Backpack New Model 2026 with the ergonomic features supported by its description.',
      candidates: [
        {
          productId: before.id,
          title: before.title,
          evidence: 'S-shaped straps that keep the spine straight.',
        },
      ],
      appliedFix: null,
      watchers: 0,
    },
    {
      key: 'kids-raincoat|backpack-cover',
      type: 'assortment_gap',
      needLabel: 'Kids raincoat with backpack cover',
      category: 'kids-raincoat',
      tags: ['backpack-cover'],
      thisWeek: 52,
      lastWeek: 30,
      matchingProducts: 0,
      priceBand: { p25: 120000, p75: 180000 },
      neededWith: [{ category: 'school-backpack', share: 0.7 }],
      advice: 'Consider stocking raincoats that cover a school backpack.',
      appliedFix: null,
      watchers: 0,
    },
    {
      key: 'none|',
      type: 'assortment_gap',
      needLabel: 'Not in catalog: Dog food, Dog bed',
      category: null,
      tags: [],
      thisWeek: 9,
      lastWeek: 4,
      matchingProducts: 0,
      priceBand: null,
      neededWith: [],
      advice: 'Explore a pet essentials assortment.',
      appliedFix: null,
      watchers: 0,
    },
  ],
  combos: [
    {
      categories: ['school-backpack', 'water-bottle', 'lunch-box'],
      count: 105,
    },
  ],
  topNeeds: [
    { event: 'back_to_school', count: 160 },
    { event: 'newborn', count: 60 },
    { event: 'first_apartment', count: 70 },
  ],
  recent: [],
};
