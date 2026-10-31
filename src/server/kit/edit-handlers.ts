import { getAdapter } from '@/server/commerce';
import { getKitStore } from '@/server/kits';
import { createEditHandlers } from './edits';
export const editHandlers = createEditHandlers(() => ({
  adapter: getAdapter(),
  store: getKitStore(),
}));
