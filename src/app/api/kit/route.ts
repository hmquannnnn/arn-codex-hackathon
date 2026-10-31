import { getAdapter } from '@/server/commerce';
import { getKitStore } from '@/server/kits';
import { getLLM } from '@/server/llm';
import { createKitHandler } from '@/server/sse';
export const maxDuration = 120;
export const POST = createKitHandler(() => ({ adapter: getAdapter(), store: getKitStore(), llm: getLLM() }));
