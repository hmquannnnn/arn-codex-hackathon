import { NextResponse } from 'next/server';
import { jsonEndpoint } from '@/server/http';
import { getInsights, type InsightDeps } from './index';
export function createInsightsHandler(deps: InsightDeps | (() => InsightDeps)) {
  return (request: Request) =>
    jsonEndpoint(async () =>
      NextResponse.json(
        await getInsights(
          typeof deps === 'function' ? deps() : deps,
          new URL(request.url).searchParams.get('shopId') || 'all',
        ),
      ),
    );
}
