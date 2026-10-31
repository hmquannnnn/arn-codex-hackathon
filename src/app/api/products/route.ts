import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getAdapter } from '@/server/commerce';
import { jsonEndpoint } from '@/server/http';
export const dynamic = 'force-dynamic';
export async function GET(request: Request) {
  return jsonEndpoint(async () => {
    const q = new URL(request.url).searchParams;
    const limit = z.coerce
      .number()
      .int()
      .min(1)
      .max(200)
      .parse(q.get('limit') ?? 40);
    const adapter = getAdapter();
    const [products, shops] = await Promise.all([
      adapter.searchProducts({
        text: q.get('q') ?? undefined,
        category: q.get('category') ?? undefined,
        limit,
      }),
      adapter.listShops(),
    ]);
    const joined = products.map((product) => {
      const shop = shops.find((s) => s.id === product.shopId);
      if (!shop) throw new Error('Missing shop');
      return { ...product, shop };
    });
    return NextResponse.json({ products: joined });
  });
}
