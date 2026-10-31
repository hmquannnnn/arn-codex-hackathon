import { getAdapter } from '@/server/commerce';
import { getKitStore } from '@/server/kits';
import { getLLM } from '@/server/llm';
import { createRefineHandler } from '@/server/sse';
export const maxDuration = 120;
export const POST = createRefineHandler(() => ({ adapter:getAdapter(),store:getKitStore(),llm:getLLM() }));
