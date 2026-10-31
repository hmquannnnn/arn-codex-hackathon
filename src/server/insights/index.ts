import type { CommerceAdapter } from '@/contract/commerce-adapter';
import type { InsightAdviceCache } from '@/server/commerce/advice-cache';
import type { InsightsResponse } from '@/contract/types';
import type { LLM } from '@/server/llm';
import { readWithRetry } from '@/server/commerce/paging';
import { today } from '@/server/today';
import { HttpError } from '@/server/http';
import { aggregateDemand, gapKey } from './aggregate';
import { classifyAndAdvise } from './classify';
export interface InsightDeps {
  adapter: CommerceAdapter;
  cache: InsightAdviceCache;
  llm: LLM;
}
export async function getInsights(
  deps: InsightDeps,
  shopId: string,
): Promise<InsightsResponse> {
  const date = today();
  const from = (days: number) =>
    new Date(Date.parse(date + 'T00:00:00Z') - days * 86400000).toISOString();
  const window = { thisWeekFrom: from(6), lastWeekFrom: from(13), today: date };
  const [rows, products, shops, recent] = await Promise.all([
    deps.adapter.demandItemsSince(window.lastWeekFrom),
    deps.adapter.searchProducts({}),
    deps.adapter.listShops(),
    readWithRetry('recentDemandItems', () =>
      deps.adapter.recentDemandItems(10),
    ),
  ]);
  if (shopId !== 'all' && !shops.some((s) => s.id === shopId))
    throw new HttpError(404, 'not_found', 'Shop not found');
  const { gaps, combos, topNeeds } = aggregateDemand(rows, window);
  const classified = await Promise.all(
    gaps.map((g) =>
      classifyAndAdvise(g, products, shopId, deps.llm, deps.cache),
    ),
  );
  classified.sort(
    (a, b) =>
      (shopId === 'all'
        ? 0
        : Number(b.type === 'listing_gap') -
          Number(a.type === 'listing_gap')) ||
      b.thisWeek - a.thisWeek ||
      a.key.localeCompare(b.key),
  );
  return {
    window,
    gaps: classified.slice(0, 8),
    combos,
    topNeeds,
    recent: recent
      .filter((r) => r.source === 'live' && r.matchedCount < 2)
      .slice(0, 10)
      .map((r) => ({
        needLabel:
          r.category === null
            ? r.needLabel
            : (gaps.find((g) => g.key === gapKey(r))?.needLabel ?? r.needLabel),
        category: r.category,
        tags: r.tags,
        event: r.event,
        createdAt: r.createdAt,
      })),
  };
}
