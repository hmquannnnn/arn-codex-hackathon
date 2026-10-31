import { getAdapter } from '@/server/commerce';
import { getLLM } from '@/server/llm';
import { createEnrichmentHandlers } from '@/server/enrichment/http';
export const maxDuration = 300;
export const POST = createEnrichmentHandlers(() => ({
  adapter: getAdapter(),
  llm: getLLM(),
})).preview;
