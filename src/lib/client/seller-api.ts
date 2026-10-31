import type {
  EnrichmentApplyRequest,
  EnrichmentPreviewResponse,
  EnrichmentResponse,
  InsightsResponse,
  ShopsResponse,
} from '@/contract/types';
import { shopSchema } from '@/contract/schemas';
import shops from '@/contract/fixtures/shops.json';
import { getJSON } from './store';
import { insightsFixture, previewFixture } from './seller-fixtures';
const post = (body: unknown): RequestInit => ({
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(body),
});
export interface SellerApi {
  shops(): Promise<ShopsResponse>;
  insights(shop: string): Promise<InsightsResponse>;
  preview(
    productId: string,
    gapKey: string,
  ): Promise<EnrichmentPreviewResponse>;
  apply(proposalId: string): Promise<EnrichmentResponse>;
  undo(productId: string): Promise<EnrichmentResponse>;
}
export class HttpSellerApi implements SellerApi {
  shops() {
    return getJSON<ShopsResponse>('/api/shops');
  }
  insights(shop: string) {
    return getJSON<InsightsResponse>(
      `/api/seller/insights?shopId=${encodeURIComponent(shop)}`,
    );
  }
  preview(productId: string, gapKey: string) {
    return getJSON<EnrichmentPreviewResponse>(
      '/api/seller/enrichment/preview',
      post({ productId, gapKey }),
    );
  }
  apply(proposalId: string) {
    const body: EnrichmentApplyRequest = { proposalId };
    return getJSON<EnrichmentResponse>(
      '/api/seller/enrichment/apply',
      post(body),
    );
  }
  undo(productId: string) {
    return getJSON<EnrichmentResponse>(
      '/api/seller/enrichment/undo',
      post({ productId }),
    );
  }
}
export class MockSellerApi implements SellerApi {
  async shops() {
    return { shops: shopSchema.array().parse(shops) };
  }
  async insights(shop: string) {
    const data = structuredClone(insightsFixture);
    const fixed = localStorage.getItem('kitly-mock-listing-fixed');
    data.gaps.forEach((g) => {
      g.watchers = Number(localStorage.getItem(`kitly-watch:${g.key}`) || 0);
    });
    if (shop === 'shop-minhan' && fixed)
      data.gaps[0].appliedFix = {
        productId: previewFixture.before.id,
        title: previewFixture.after.title,
        appliedAt: fixed,
      };
    if (shop !== 'shop-minhan') {
      data.gaps[0].type = 'assortment_gap';
      data.gaps[0].candidates = [];
      data.gaps.sort((a, b) => b.thisWeek - a.thisWeek);
    }
    return data;
  }
  async preview(productId: string, _gapKey: string) {
    if (productId !== previewFixture.before.id)
      throw new Error('No recorded preview for this listing.');
    return structuredClone(previewFixture);
  }
  async apply(proposalId: string) {
    if (
      proposalId !== previewFixture.proposalId ||
      localStorage.getItem('kitly-mock-listing-fixed')
    )
      throw new Error(
        'This preview is no longer available. Refresh and try again.',
      );
    localStorage.setItem('kitly-mock-listing-fixed', new Date().toISOString());
    return { product: structuredClone(previewFixture.after) };
  }
  async undo(productId: string) {
    if (productId !== previewFixture.before.id)
      throw new Error('No recorded listing to undo.');
    localStorage.removeItem('kitly-mock-listing-fixed');
    return { product: structuredClone(previewFixture.before) };
  }
}
export async function subscribeToNeed(gapKey: string) {
  if (process.env.NEXT_PUBLIC_KITLY_MOCK === '1') {
    const key = `kitly-watch:${gapKey}`;
    const watchers = Number(localStorage.getItem(key) || 0) + 1;
    localStorage.setItem(key, String(watchers));
    return { watchers };
  }
  return getJSON<{ watchers: number }>('/api/demand/watch', post({ gapKey }));
}
