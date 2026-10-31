import { createHmac, timingSafeEqual } from 'node:crypto';
import { isDeepStrictEqual } from 'node:util';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import {
  enrichmentPreviewRequestSchema,
  enrichmentApplyRequestSchema,
  enrichmentUndoRequestSchema,
  productSchema,
} from '@/contract/schemas';
import type { EnrichmentAdapter } from './adapter';
import type { LLM } from '@/server/llm';
import { HttpError, jsonEndpoint } from '@/server/http';
import { aggregateDemand } from '@/server/insights/aggregate';
import { today } from '@/server/today';
import { proposeEnrichment } from './propose';
import { keywordCheck, mergeEnrichment } from './merge';
interface Deps {
  adapter: EnrichmentAdapter;
  llm: LLM;
  secret?: string;
}
const tokenSchema = z.object({
  productId: z.string(),
  before: productSchema,
  after: productSchema,
  createdAt: z.number(),
});
const missing = () =>
  new HttpError(404, 'not_found', 'Proposal or listing not found');
function secret(deps: Deps) {
  const value =
    deps.secret ||
    process.env.KITLY_PROPOSAL_SECRET ||
    process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!value) throw new Error('Proposal signing secret missing');
  return value;
}
export function createEnrichmentHandlers(source: Deps | (() => Deps)) {
  const deps = () => (typeof source === 'function' ? source() : source);
  return {
    preview: (request: Request) =>
      jsonEndpoint(async () => {
        const { productId, gapKey } = enrichmentPreviewRequestSchema.parse(
          await request.json(),
        );
        const d = deps(),
          before = await d.adapter.getProduct(productId);
        if (!before) throw missing();
        const date = today(),
          from = (days: number) =>
            new Date(
              Date.parse(date + 'T00:00:00Z') - days * 86400000,
            ).toISOString();
        const { gaps } = aggregateDemand(
          await d.adapter.demandItemsSince(from(13)),
          { thisWeekFrom: from(6), lastWeekFrom: from(13), today: date },
        );
        const gap = gaps.find(
          (g) => g.key === gapKey && g.category === before.category,
        );
        if (!gap) throw missing();
        const proposal = await proposeEnrichment(before, gap, d.llm);
        const after = mergeEnrichment(before, proposal);
        const payload = Buffer.from(
          JSON.stringify({ productId, before, after, createdAt: Date.now() }),
        ).toString('base64url');
        const proposalId =
          payload +
          '.' +
          createHmac('sha256', secret(d)).update(payload).digest('base64url');
        return NextResponse.json({
          proposalId,
          before,
          after,
          added: {
            titleSuffix:
              after.title === before.title
                ? ''
                : after.title.slice(before.title.length + 3),
            tags: proposal.tags,
            attributes: proposal.attributes,
            descriptionAppend: proposal.descriptionAppend,
          },
          kept: { title: before.title, tags: before.tags },
          keywordCheck: keywordCheck(before, after),
          evidence: proposal.evidence,
        });
      }),
    apply: (request: Request) =>
      jsonEndpoint(async () => {
        const { proposalId } = enrichmentApplyRequestSchema.parse(
          await request.json(),
        );
        const d = deps();
        let token: z.infer<typeof tokenSchema>;
        try {
          const parts = proposalId.split('.');
          if (parts.length !== 2) throw missing();
          const signature = createHmac('sha256', secret(d))
            .update(parts[0])
            .digest();
          const supplied = Buffer.from(parts[1], 'base64url');
          if (
            signature.length !== supplied.length ||
            !timingSafeEqual(signature, supplied)
          )
            throw missing();
          token = tokenSchema.parse(
            JSON.parse(Buffer.from(parts[0], 'base64url').toString()),
          );
          if (
            Date.now() - token.createdAt >= 30 * 60000 ||
            token.createdAt > Date.now()
          )
            throw missing();
        } catch {
          throw missing();
        }
        const current = await d.adapter.getProduct(token.productId);
        if (!current) throw missing();
        const listing = (p: typeof current) =>
          p && {
            title: p.title,
            description: p.description,
            tags: p.tags,
            attributes: p.attributes,
          };
        if (isDeepStrictEqual(listing(current), listing(token.after)))
          throw missing();
        if (!isDeepStrictEqual(current, token.before))
          throw new HttpError(
            409,
            'listing_changed',
            'Listing changed; preview again',
          );
        return NextResponse.json({
          product: await d.adapter.updateListing(
            token.productId,
            token.after,
            token.before,
          ),
        });
      }),
    undo: (request: Request) =>
      jsonEndpoint(async () => {
        const { productId } = enrichmentUndoRequestSchema.parse(
          await request.json(),
        );
        const product = await deps().adapter.undoListing(productId);
        if (!product) throw missing();
        return NextResponse.json({ product });
      }),
  };
}
