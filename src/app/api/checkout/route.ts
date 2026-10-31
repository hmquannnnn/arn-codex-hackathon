import { getAdapter } from '@/server/commerce';
import { cartHandler } from '@/server/cart/http';
export const POST = cartHandler(getAdapter, true);
