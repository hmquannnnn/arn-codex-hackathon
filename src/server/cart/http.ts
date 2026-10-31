import { randomUUID } from 'node:crypto';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { checkoutRequestSchema } from '@/contract/schemas';
import type { CommerceAdapter } from '@/contract/commerce-adapter';
import { HttpError, jsonEndpoint } from '@/server/http';
import { personaFrom } from '@/server/identity';
import { quoteCart } from './checkout';
const requestSchema = checkoutRequestSchema.extend({
  expectedTotal: z.number().int().nonnegative().optional(),
});
export function cartHandler(adapter: () => CommerceAdapter, checkout = false) {
  return (request: Request) =>
    jsonEndpoint(async () => {
      const body = requestSchema.parse(await request.json());
      const option = await quoteCart(
        adapter(),
        body.lines,
        personaFrom(request),
      );
      if (!checkout) return NextResponse.json(option);
      if (
        body.expectedTotal !== undefined &&
        body.expectedTotal !== option.grandTotal
      )
        throw new HttpError(
          409,
          'price_changed',
          'Prices changed. Review the latest total before checkout.',
        );
      return NextResponse.json({
        orderId: randomUUID(),
        grandTotal: option.grandTotal,
      });
    });
}
