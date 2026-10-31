import { getAdapter } from '@/server/commerce';
import { getLLM } from '@/server/llm';
import { createInsightsHandler } from '@/server/insights/http';
export const maxDuration = 300;
export const dynamic = 'force-dynamic';
export const GET = createInsightsHandler(() => {
  const adapter = getAdapter();
  return { adapter, cache: adapter, llm: getLLM() };
});
