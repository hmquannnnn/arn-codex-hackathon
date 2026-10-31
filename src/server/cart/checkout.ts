import type { CommerceAdapter } from '@/contract/commerce-adapter';
import type {
  CheckoutRequest,
  KitPlan,
  PersonaId,
  Candidate,
} from '@/contract/types';
import { HttpError } from '@/server/http';
import { priceBasket } from '@/server/optimizer/pricing';
import { today } from '@/server/today';
/** Resolve catalog data afresh and reuse the kit's exact voucher/shipping calculation. */
export async function quoteCart(
  adapter: CommerceAdapter,
  lines: CheckoutRequest['lines'],
  persona: PersonaId,
) {
  const quantities = new Map<string, number>();
  for (const line of lines)
    quantities.set(
      line.productId,
      (quantities.get(line.productId) ?? 0) + line.quantity,
    );
  const [products, shops, vouchers] = await Promise.all([
    Promise.all([...quantities.keys()].map((id) => adapter.getProduct(id))),
    adapter.listShops(),
    adapter.listVouchers(persona),
  ]);
  const plan: KitPlan = {
    event: 'other',
    language: 'en',
    budget: null,
    deadline: null,
    assumptions: [],
    items: [],
  };
  const picks: Record<string, Candidate> = {};
  for (const product of products) {
    if (!product) throw new HttpError(404, 'not_found', 'Product not found');
    const quantity = quantities.get(product.id)!;
    if (quantity > product.stock)
      throw new HttpError(
        409,
        'out_of_stock',
        'Requested quantity unavailable',
      );
    const shop = shops.find((s) => s.id === product.shopId);
    if (!shop) throw new HttpError(409, 'invalid_request', 'Shop unavailable');
    plan.items.push({
      key: product.id,
      needLabel: product.title,
      category: product.category,
      required: true,
      quantity,
      mustHaveTags: [],
      niceToHaveTags: [],
      maxUnitPrice: null,
    });
    picks[product.id] = {
      product,
      shop,
      score: 0,
      matchedTags: [],
      arrivesBy: today(),
    };
  }
  return priceBasket(
    { plan, candidates: {}, noMatch: [], vouchers },
    picks,
    'balanced',
  );
}
