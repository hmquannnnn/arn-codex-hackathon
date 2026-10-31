import { isDeepStrictEqual } from 'node:util';
import { HttpError } from '@/server/http';
import { randomUUID } from 'node:crypto';
import type {
  CommerceAdapter,
  ProductQuery,
} from '@/contract/commerce-adapter';
import type {
  CategoryId,
  DemandItemRow,
  KitPlan,
  PersonaId,
  Product,
  Shop,
  Voucher,
  RecentDemandItem,
} from '@/contract/types';
import products from '@/contract/fixtures/products.json';
import shops from '@/contract/fixtures/shops.json';
import vouchers from '@/contract/fixtures/vouchers.json';
import personas from '@/contract/fixtures/personas.json';
import demand from '@/contract/fixtures/demand.json';
import {
  demandItemRowSchema,
  personaSchema,
  productSchema,
  shopSchema,
  voucherSchema,
} from '@/contract/schemas';
import { demoTimestamp } from '@/server/today';

/** Real mutable adapter for fixtures/tests. Per-instance state is deliberately not production persistence. */
export class InMemoryAdapter implements CommerceAdapter {
  private watches = new Map<string, number>();
  async addDemandWatch(gapKey: string) {
    const count = (this.watches.get(gapKey) ?? 0) + 1;
    this.watches.set(gapKey, count);
    return count;
  }
  async demandWatchCounts(gapKeys: string[]) {
    return Object.fromEntries(
      gapKeys.map((key) => [key, this.watches.get(key) ?? 0]),
    );
  }
  private advice = new Map<string, { signature: string; advice: string }>();
  async getInsightAdvice(key: string, signature: string) {
    const row = this.advice.get(key);
    return row?.signature === signature ? row.advice : null;
  }
  async saveInsightAdvice(key: string, signature: string, advice: string) {
    this.advice.set(key, { signature, advice });
  }
  private products = productSchema.array().parse(structuredClone(products));
  private shops = shopSchema.array().parse(structuredClone(shops));
  private vouchers = voucherSchema.array().parse(structuredClone(vouchers));
  private personas = personaSchema.array().parse(structuredClone(personas));
  private demand: RecentDemandItem[] = demandItemRowSchema
    .array()
    .parse(structuredClone(demand))
    .map((row) => ({ ...row, source: 'seed' }));
  constructor(
    initial: {
      demand?: DemandItemRow[];
      products?: Product[];
      shops?: Shop[];
      vouchers?: Voucher[];
    } = {},
  ) {
    if (initial.products)
      this.products = productSchema
        .array()
        .parse(structuredClone(initial.products));
    if (initial.shops)
      this.shops = shopSchema.array().parse(structuredClone(initial.shops));
    if (initial.vouchers)
      this.vouchers = voucherSchema
        .array()
        .parse(structuredClone(initial.vouchers));
    if (initial.demand)
      this.demand = demandItemRowSchema
        .array()
        .parse(structuredClone(initial.demand))
        .map((row) => ({ ...row, source: 'seed' }));
  }
  private sessions = new Map<
    string,
    { plan: KitPlan; source: 'live' | 'seed'; createdAt: string }
  >();
  private snapshots = new Map<string, Product[]>();
  async listShops() {
    return structuredClone(this.shops);
  }
  async getProduct(id: string) {
    return structuredClone(this.products.find((p) => p.id === id) ?? null);
  }
  async searchProducts(q: ProductQuery) {
    const text = q.text?.trim().toLocaleLowerCase();
    return structuredClone(
      this.products
        .filter(
          (p) =>
            (!text ||
              `${p.title} ${p.description} ${p.tags.join(' ')}`
                .toLocaleLowerCase()
                .includes(text)) &&
            (q.category === undefined || p.category === q.category) &&
            (q.categories === undefined || q.categories.includes(p.category)) &&
            (!q.tagsAny?.length ||
              q.tagsAny.some((tag) => p.tags.includes(tag))) &&
            (q.maxPrice === undefined || p.price <= q.maxPrice),
        )
        .slice(0, q.limit === undefined ? undefined : Math.max(0, q.limit)),
    );
  }
  async listVouchers(persona?: PersonaId) {
    return structuredClone(
      this.vouchers.filter(
        (v) =>
          v.ownerPersona === null ||
          (persona !== undefined &&
            persona !== 'guest' &&
            v.ownerPersona === persona),
      ),
    );
  }
  async getPersona(id: PersonaId) {
    const persona = this.personas.find((p) => p.id === id);
    if (!persona) throw new Error('Persona not found');
    return structuredClone(persona);
  }
  async recordIntent(s: {
    query: string;
    plan: KitPlan;
    source: 'live' | 'seed';
  }) {
    const sessionId = randomUUID();
    this.sessions.set(sessionId, {
      plan: structuredClone(s.plan),
      source: s.source,
      createdAt: demoTimestamp(),
    });
    return { sessionId };
  }
  async recordDemandItems(
    sessionId: string,
    items: Parameters<CommerceAdapter['recordDemandItems']>[1],
  ) {
    const session = this.sessions.get(sessionId);
    if (!session) throw new Error('Intent session not found');
    for (const { item, matchedCount, budgetHint } of items)
      this.demand.push({
        sessionId,
        createdAt: session.createdAt,
        event: session.plan.event,
        needLabel: item.needLabel,
        category: item.category,
        tags: [...item.mustHaveTags],
        matchedCount,
        budgetHint,
        source: session.source,
      });
  }
  async demandItemsSince(sinceIso: string, filter?: { category?: CategoryId }) {
    return structuredClone(
      this.demand
        .filter(
          (d) =>
            d.createdAt >= sinceIso &&
            (filter?.category === undefined || d.category === filter.category),
        )
        .map(({ source: _source, ...row }) => row),
    );
  }
  async recentDemandItems(limit: number) {
    return structuredClone(
      this.demand
        .filter((d) => d.source === 'live' && d.matchedCount < 2)
        .reverse()
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
        .slice(0, Math.max(0, limit)),
    );
  }
  async updateListing(
    productId: string,
    patch: Pick<Product, 'title' | 'description' | 'tags' | 'attributes'>,
    expected?: Product,
  ) {
    const index = this.products.findIndex((p) => p.id === productId);
    if (index < 0) throw new Error('Product not found');
    const current = this.products[index];
    if (expected && !isDeepStrictEqual(current, expected)) {
      const used =
        current.title === patch.title &&
        current.description === patch.description &&
        isDeepStrictEqual(current.tags, patch.tags) &&
        isDeepStrictEqual(current.attributes, patch.attributes);
      throw new HttpError(
        used ? 404 : 409,
        used ? 'not_found' : 'listing_changed',
        'Proposal used or listing changed',
      );
    }
    const updated = productSchema.parse({
      ...current,
      title: patch.title,
      description: patch.description,
      tags: [...patch.tags],
      attributes: { ...patch.attributes },
      updatedForDemandAt: demoTimestamp(),
    });
    const history = this.snapshots.get(productId) ?? [];
    history.push(structuredClone(current));
    this.snapshots.set(productId, history);
    this.products[index] = updated;
    return structuredClone(updated);
  }
  async undoListing(productId: string) {
    const previous = this.snapshots.get(productId)?.pop();
    if (!previous) return null;
    this.products[this.products.findIndex((p) => p.id === productId)] =
      previous;
    return structuredClone(previous);
  }
}
