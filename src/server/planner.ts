import { z } from 'zod';
import { kitPlanSchema, planItemSchema } from '@/contract/schemas';
import { CATEGORY_IDS, canonicalTags } from '@/contract/taxonomy';
import type { KitPlan } from '@/contract/types';
import { getModels, type LLM } from '@/server/llm';
import { today } from '@/server/today';

// Keep the output vocabulary strict, but normalize raw quantities and dates in code.
const plannerSchema = kitPlanSchema.extend({
  deadline: z.string().nullable(),
  items: z.array(
    planItemSchema.extend({
      category: z.enum(CATEGORY_IDS).nullable(),
      quantity: z.number().int(),
      mustHaveTags: z.array(z.enum(canonicalTags)),
      niceToHaveTags: z.array(z.enum(canonicalTags)),
    }),
  ),
});
const contextTags = new Set([
  'grade-1',
  'kids',
  'newborn-0-3m',
  'budget',
  'premium',
  'gift-wrapped',
  'eco-friendly',
]);

function plannerPrompt() {
  return `Today is ${today()}. You plan complete shopping kits in integer VND.
Vietnamese input → language vi; otherwise follow the buyer's language.
Use null when no category fits, never force one. Categories: ${CATEGORY_IDS.join(', ')}.
Use only canonical tags: ${canonicalTags.join(', ')}.
For every event, including other (a wedding, a puppy, learning guitar), list the full kit: 5–10 items, category null for each item no category fits; never an empty or one-item plan.
Be consistent: the same sentence must give the same plan. Still list the full kit — for tet_gifts 5–8 gift items.
Use mustHaveTags only for attributes the buyer explicitly stated for that exact item. Grade, children, budget and gift context are nice-to-have, not filters on unrelated items.
For 'My kid starts Grade 1. Budget 1.5M VND. The backpack must be anti-hunchback, under 400k.', only the backpack has mustHaveTags [anti-hunchback], maxUnitPrice 400000; all other items have no must-have tags.
Every set/pack item (book covers, pens, notebooks sets, crayons, wipes, diapers) has quantity 1 for one pack. Quantity > 1 only when the buyer explicitly asks, or for rotation clothing (uniform = 2).
Vietnamese school year opens on Sep 5: for back_to_school without a stated date, deadline = the next Sep 5 on/after today and add the assumption 'By Sep 5 (school opening)'.
Express / hoả tốc / giao nhanh ⇒ deadline = today + 2 days. Never return a date before today.
When no budget is stated, budget = null. Do not invent a budget. Return short assumptions in the plan language.`;
}

function nextSchoolDate() {
  const year = Number(today().slice(0, 4));
  const candidate = `${year}-09-05`;
  return candidate >= today() ? candidate : `${year + 1}-09-05`;
}

function normalize(raw: z.infer<typeof plannerSchema>): KitPlan {
  const deadline = raw.deadline;
  const validDate =
    deadline !== null &&
    /^\d{4}-\d{2}-\d{2}$/.test(deadline) &&
    Number.isFinite(Date.parse(`${deadline}T00:00:00.000Z`)) &&
    new Date(`${deadline}T00:00:00.000Z`).toISOString().slice(0, 10) ===
      deadline &&
    deadline >= today();
  const assumptions = raw.assumptions.filter((assumption) => {
    const text = assumption
      .normalize('NFD')
      .replace(/\p{Diacritic}/gu, '')
      .toLowerCase();
    const schoolOpening =
      /school\s+(?:year\s+)?(?:opening|starts?)|khai\s*giang/.test(text);
    const schoolDate =
      raw.event === 'back_to_school' &&
      /sep(?:tember)?[ .]*5\b|\b5[/.]0?9\b|\b5\s+sep|09-05/.test(text);
    return !schoolOpening && !schoolDate;
  });
  if (
    raw.event === 'back_to_school' &&
    validDate &&
    deadline === nextSchoolDate()
  ) {
    assumptions.unshift(
      raw.language === 'vi'
        ? 'Trước 5/9 (khai giảng)'
        : 'By Sep 5 (school opening)',
    );
  }
  return kitPlanSchema.parse({
    ...raw,
    deadline: validDate ? deadline : null,
    assumptions,
    items: raw.items.map((item) => ({
      ...item,
      quantity: Math.max(1, Math.min(3, item.quantity)),
      mustHaveTags: [
        ...new Set(item.mustHaveTags.filter((tag) => !contextTags.has(tag))),
      ],
      niceToHaveTags: [
        ...new Set([
          ...item.niceToHaveTags,
          ...item.mustHaveTags.filter((tag) => contextTags.has(tag)),
        ]),
      ],
    })),
  });
}

export async function planNeed(llm: LLM, query: string): Promise<KitPlan> {
  const models = getModels();
  async function request(fuller = false) {
    for (let attempt = 0; ; attempt++) {
      try {
        const raw = await llm.structured(
          models.planner,
          plannerSchema,
          [
            { role: 'system', content: plannerPrompt() },
            { role: 'user', content: query },
            ...(fuller
              ? [
                  {
                    role: 'developer' as const,
                    content:
                      'The prior plan was too short. Give the full kit: 5–10 useful items for the same need, including category null for uncovered items.',
                  },
                ]
              : []),
          ],
          { effort: models.plannerEffort },
        );
        return normalize(raw);
      } catch (error) {
        if (attempt >= 1) throw error;
      }
    }
  }
  const initial = await request();
  if (initial.items.length >= 3) return initial;
  try {
    const fuller = await request(true);
    return fuller.items.length > initial.items.length ? fuller : initial;
  } catch {
    // A valid sparse answer remains usable when the optional expansion fails.
    return initial;
  }
}
