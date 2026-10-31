import { randomUUID } from 'node:crypto';
import { NextResponse } from 'next/server';
import { checkoutRequestSchema } from '@/contract/schemas';
import { getAdapter } from '@/server/commerce';
import { HttpError, jsonEndpoint } from '@/server/http';
export async function POST(request: Request) {
  return jsonEndpoint(async () => {
    const { lines } = checkoutRequestSchema.parse(await request.json());
    const adapter = getAdapter();
    const quantities = new Map<string, number>();
    for (const line of lines)
      quantities.set(
        line.productId,
        (quantities.get(line.productId) ?? 0) + line.quantity,
      );
    let itemsTotal = 0;
    const shopIds = new Set<string>();
    for (const [id, quantity] of quantities) {
      const product = await adapter.getProduct(id);
      if (!product) throw new HttpError(404, 'not_found', 'Product not found');
      if (quantity > product.stock)
        throw new HttpError(
          409,
          'out_of_stock',
          'Requested quantity unavailable',
        );
      itemsTotal += product.price * quantity;
      shopIds.add(product.shopId);
    }
    const shops = await adapter.listShops();
    let shipping = 0;
    for (const id of shopIds) {
      const shop = shops.find((s) => s.id === id);
      if (!shop) throw new Error('Missing shop');
      shipping += shop.shipFee;
    }
    // Demo receipt only: no payment, inventory mutation, or persistence. Optimizer vouchers are a later ticket.
    return NextResponse.json({
      orderId: randomUUID(),
      grandTotal: itemsTotal + shipping,
    });
  });
}
