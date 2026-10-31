import { NextResponse } from 'next/server';
import { getAdapter } from '@/server/commerce';
import { HttpError, jsonEndpoint } from '@/server/http';
import { personaFrom } from '@/server/identity';
export const dynamic = 'force-dynamic';
export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  return jsonEndpoint(async () => {
    const { id } = await context.params;
    const adapter = getAdapter();
    const product = await adapter.getProduct(id);
    if (!product) throw new HttpError(404, 'not_found', 'Product not found');
    const [shops, vouchers] = await Promise.all([
      adapter.listShops(),
      adapter.listVouchers(personaFrom(request)),
    ]);
    const shop = shops.find((s) => s.id === product.shopId);
    if (!shop) throw new Error('Missing shop');
    return NextResponse.json({
      product,
      shop,
      vouchers: vouchers.filter(
        (v) => v.scope === 'platform' || v.shopId === shop.id,
      ),
    });
  });
}
