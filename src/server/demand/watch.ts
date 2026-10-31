import { NextResponse } from 'next/server';
import { demandWatchRequestSchema } from '@/contract/schemas';
import { HttpError, jsonEndpoint } from '@/server/http';
/** Kitly-owned demand subscriptions, separate from the frozen commerce contract. */
export interface DemandWatches {
  addDemandWatch(gapKey: string): Promise<number>;
  demandWatchCounts(gapKeys: string[]): Promise<Record<string, number>>;
}
export function createWatchHandler(
  source: DemandWatches | (() => DemandWatches),
) {
  return (request: Request) =>
    jsonEndpoint(async () => {
      const { gapKey } = demandWatchRequestSchema.parse(await request.json());
      if (!gapKey.trim() || gapKey.length > 512)
        throw new HttpError(400, 'invalid_request', 'Invalid gap key');
      const adapter = typeof source === 'function' ? source() : source;
      return NextResponse.json({
        watchers: await adapter.addDemandWatch(gapKey),
      });
    });
}
