import { categories } from '../../src/contract/taxonomy';
import type {
  DemandItemRow,
  EventType,
  KitPlan,
  PlanItem,
  Product,
} from '../../src/contract/types';
import { seedDate } from './catalog';

export interface SeedSession {
  id: string;
  query: string;
  event: EventType;
  language: 'en' | 'vi';
  plan: KitPlan;
  source: 'seed';
  createdAt: string;
}
export interface SeedDemand {
  sessions: SeedSession[];
  demandItems: DemandItemRow[];
}
const forced = [
  {
    category: 'school-backpack',
    tag: 'anti-hunchback',
    counts: [37, 21, 15, 12],
    low: 300000,
    high: 400000,
  },
  {
    category: 'kids-raincoat',
    tag: 'backpack-cover',
    counts: [52, 30, 20, 17],
    low: 120000,
    high: 180000,
  },
  {
    category: 'kids-desk-lamp',
    tag: 'anti-blue-light',
    counts: [18, 15, 11, 8],
    low: 250000,
    high: 400000,
  },
];
const volumes = {
  back_to_school: 160,
  newborn: 60,
  first_apartment: 70,
  camping_trip: 50,
  home_office: 40,
  tet_gifts: 10,
} as const;

/** Exact endpoint plateaus make both interpolated and nearest-rank percentiles stable. */
function bandHint(
  index: number,
  count: number,
  low: number,
  high: number,
): number {
  const plateau = Math.ceil(count * 0.4);
  if (index < plateau) return low;
  if (index >= count - plateau) return high;
  return Math.round((low + high) / 2);
}

export function generateDemand(products: Product[], today: string): SeedDemand {
  const sessions: SeedSession[] = [];
  const demandItems: DemandItemRow[] = [];
  for (let week = 0; week < 4; week++) {
    for (const [event, volume] of Object.entries(volumes) as [
      keyof typeof volumes,
      number,
    ][]) {
      const eventCategories = categories.filter((c) => c.event === event);
      const count = event === 'back_to_school' && week === 0 ? 240 : volume;
      for (let index = 0; index < count; index++) {
        const sequence = sessions.length + 1;
        const id = `10000000-0000-4000-8000-${String(sequence).padStart(12, '0')}`;
        const createdAt = seedDate(today, -week * 7 - (index % 7)).replace(
          '00:00:00.000',
          '12:00:00.000',
        );
        const picked =
          event === 'back_to_school'
            ? [
                'school-backpack',
                'water-bottle',
                index % 4 === 0 ? 'school-shoes' : 'lunch-box',
                'kids-raincoat',
                'kids-desk-lamp',
                'notebooks',
                'pencils-pens',
                'pencil-case',
              ].map((id) => categories.find((c) => c.id === id)!)
            : Array.from(
                { length: 6 + (index % 3) },
                (_, i) => eventCategories[(i + index) % eventCategories.length],
              );
        const items: PlanItem[] = picked.map((category, i) => ({
          key: `item-${i + 1}`,
          needLabel: category.label,
          category: category.id,
          required: i < 6,
          quantity: 1,
          mustHaveTags: [],
          niceToHaveTags: [],
          maxUnitPrice: null,
        }));
        const hints = new Map<string, number>();
        if (event === 'back_to_school') {
          for (const gap of forced) {
            if (index < gap.counts[week]) {
              const item = items.find((i) => i.category === gap.category)!;
              item.mustHaveTags = [gap.tag];
              item.maxUnitPrice = bandHint(
                index,
                gap.counts[week],
                gap.low,
                gap.high,
              );
              hints.set(item.key, item.maxUnitPrice);
            }
          }
          if (index < [9, 4, 3, 2][week])
            items.push({
              key: 'pet',
              needLabel: ['Dog food', 'Dog bed', 'Dog leash'][index % 3],
              category: null,
              required: false,
              quantity: 1,
              mustHaveTags: [],
              niceToHaveTags: [],
              maxUnitPrice: null,
            });
        }
        const budget =
          event === 'back_to_school'
            ? 1200000 + (index % 5) * 150000
            : 2000000 + (index % 6) * 250000;
        const plan: KitPlan = {
          event,
          language: index % 2 ? 'vi' : 'en',
          budget,
          deadline: null,
          items,
          assumptions: [],
        };
        sessions.push({
          id,
          query: `Seed ${event} shopping kit ${index + 1}`,
          event,
          language: plan.language,
          plan,
          source: 'seed',
          createdAt,
        });
        for (const item of items) {
          const matchedCount =
            item.category === null
              ? 0
              : products.filter(
                  (p) =>
                    p.category === item.category &&
                    p.stock > 0 &&
                    item.mustHaveTags.every((t) => p.tags.includes(t)) &&
                    (item.maxUnitPrice === null ||
                      p.price <= item.maxUnitPrice),
                ).length;
          demandItems.push({
            sessionId: id,
            createdAt,
            event,
            needLabel: item.needLabel,
            category: item.category,
            tags: item.mustHaveTags,
            matchedCount,
            budgetHint:
              hints.get(item.key) ??
              (item.category === null
                ? null
                : Math.floor(budget / items.length)),
          });
        }
      }
    }
  }
  return { sessions, demandItems };
}
