import { NextResponse } from 'next/server';
import { getAdapter } from '@/server/commerce';
import { jsonEndpoint } from '@/server/http';
export const dynamic = 'force-dynamic';
export async function GET() {
  return jsonEndpoint(async () =>
    NextResponse.json({ shops: await getAdapter().listShops() }),
  );
}
