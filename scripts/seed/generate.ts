import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { join } from 'node:path';
import { z } from 'zod';
import {
  categories as taxonomy,
  canonicalTags,
} from '../../src/contract/taxonomy';
import type { Category, Product } from '../../src/contract/types';
import type { Effort, LLM } from '../../src/server/llm/types';
import { eventShops } from './catalog';
import fixtures from '../../src/contract/fixtures/products.json';

const generatedProductSchema = z.object({
  title: z.string().min(1),
  description: z.string().min(30),
  price: z.number().int().positive(),
  rating: z.number().min(3.8).max(5),
  reviewCount: z.number().int().min(5).max(8000),
  soldCount: z.number().int().nonnegative(),
  stock: z.number().int().min(0).max(500),
  shipDaysMin: z.number().int().min(1).max(9),
  shipDaysMax: z.number().int().min(1).max(9),
  tags: z.array(z.enum(canonicalTags)),
  priceTier: z.enum(['budget', 'mid', 'premium']),
  attributes: z
    .array(z.object({ key: z.string(), value: z.string() }))
    .min(2)
    .max(5),
});
export const catalogResponseSchema = z.object({
  products: z.array(generatedProductSchema).length(6),
});
export interface GenerateOptions {
  model?: string;
  effort?: Effort;
  cacheDir?: string;
  categories?: readonly Category[];
}

/** Eight workers bound requests; cache keys include model, effort, schema revision and prompt. */
export async function generateCatalog(
  llm: LLM,
  options: GenerateOptions = {},
): Promise<Product[]> {
  const model = options.model ?? process.env.KITLY_MODEL_FAST ?? 'gpt-6-luna';
  const effort =
    options.effort ?? ((process.env.KITLY_FAST_EFFORT || 'low') as Effort);
  const cacheDir = options.cacheDir ?? join(process.cwd(), 'scripts', '.cache');
  await mkdir(cacheDir, { recursive: true });
  const categories = (options.categories ?? taxonomy).filter(
    (c) => !['school-backpack', 'kids-raincoat'].includes(c.id),
  );
  const results: Product[][] = new Array(categories.length);
  let next = 0;
  async function worker() {
    while (next < categories.length) {
      const index = next++;
      const category = categories[index];
      const exemplar = fixtures.find((p) => p.category === category.id);
      const guidance = exemplar
        ? `A realistic budget baseline is ${exemplar.price} VND; keep the cheapest near this price.`
        : 'Use realistic affordable Vietnam retail prices.';
      const prompt = `Generate exactly six fictional marketplace products in English for category ${category.id} (${category.label}), event ${category.event}.
Return 2 budget, 2 mid, 2 premium products, in ascending price order. ${guidance}
Premium prices must reach at least 2.5 times the cheapest and premium rating/reviews must be stronger (rating >=4.8).
Descriptions: 2–4 sentences with concrete material, dimensions, capacity or other useful specs. Provide 2–5 attributes.
Canonical tags only: ${canonicalTags.join(', ')}. Never use anti-hunchback, backpack-cover, anti-blue-light: these belong to planted demo gaps.
Use relevant functional tags so event requests match. At least five products in stock and shipping within 3 days; cheapest and highest-rated ship within 2 days.
Stock 0–500 (at most one out of stock), rating 3.8–5, reviews 5–8000, ship days 1–9. Fictional brands only, no real marketplace names.`;
      const key = createHash('sha256')
        .update(JSON.stringify({ model, effort, prompt, revision: 1 }))
        .digest('hex')
        .slice(0, 20);
      const path = join(cacheDir, `${category.id}-${key}.json`);
      let response: z.infer<typeof catalogResponseSchema> | undefined;
      try {
        const raw = JSON.parse(await readFile(path, 'utf8'));
        const parsed = catalogResponseSchema.safeParse(raw);
        if (parsed.success) response = parsed.data;
      } catch (error) {
        if (
          !(error instanceof SyntaxError) &&
          (error as NodeJS.ErrnoException).code !== 'ENOENT'
        )
          throw error;
      }
      if (!response) {
        response = await llm.structured(
          model,
          catalogResponseSchema,
          [
            {
              role: 'system',
              content:
                'You generate seed catalog JSON, following the supplied schema and concrete product facts.',
            },
            { role: 'user', content: prompt },
          ],
          { effort },
        );
        // Cache the raw structured output before code-owned demo normalization.
        await writeFile(path, JSON.stringify(response, null, 2) + '\n', 'utf8');
      }
      if (category.event === 'other')
        throw new Error('Cannot generate catalog for an uncategorized event');
      results[index] = response.products.map((p, i) => ({
        id: `prod-${category.id}-${i + 1}`,
        shopId: eventShops[category.event as keyof typeof eventShops][i % 2],
        title: p.title,
        description: p.description,
        category: category.id,
        price: p.price,
        rating: p.rating,
        reviewCount: p.reviewCount,
        soldCount: p.soldCount,
        stock: p.stock,
        tags: p.tags,
        attributes: Object.fromEntries(
          p.attributes.map((a) => [a.key, a.value]),
        ),
        shipDaysMin: p.shipDaysMin,
        shipDaysMax: p.shipDaysMax,
        updatedForDemandAt: null,
      }));
    }
  }
  await Promise.all(
    Array.from({ length: Math.min(8, categories.length) }, () => worker()),
  );
  return results.flat();
}
