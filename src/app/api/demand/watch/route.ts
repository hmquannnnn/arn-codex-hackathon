import { getAdapter } from '@/server/commerce';
import { createWatchHandler } from '@/server/demand/watch';
export const POST = createWatchHandler(getAdapter);
