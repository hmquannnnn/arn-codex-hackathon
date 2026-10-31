import type { CommerceAdapter } from '@/contract/commerce-adapter';
import type { Product } from '@/contract/types';
/** Optional compare-and-swap argument, without changing the frozen marketplace contract. */
export interface EnrichmentAdapter extends CommerceAdapter {
  updateListing(
    productId: string,
    patch: Pick<Product, 'title' | 'description' | 'tags' | 'attributes'>,
    expected?: Product,
  ): Promise<Product>;
}
