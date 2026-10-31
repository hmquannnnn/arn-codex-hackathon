import type {
  CategoryId,
  DemandItemRow,
  KitPlan,
  Persona,
  PersonaId,
  PlanItem,
  Product,
  RecentDemandItem,
  Shop,
  Voucher,
} from './types';
export interface ProductQuery {
  text?: string;
  category?: CategoryId;
  categories?: CategoryId[];
  tagsAny?: string[];
  maxPrice?: number;
  limit?: number;
}
export interface CommerceAdapter {
  listShops(): Promise<Shop[]>;
  getProduct(id: string): Promise<Product | null>;
  searchProducts(q: ProductQuery): Promise<Product[]>;
  listVouchers(persona?: PersonaId): Promise<Voucher[]>;
  getPersona(id: PersonaId): Promise<Persona>;
  recordIntent(s: {
    query: string;
    plan: KitPlan;
    source: 'live' | 'seed';
  }): Promise<{ sessionId: string }>;
  recordDemandItems(
    sessionId: string,
    items: {
      item: PlanItem;
      matchedCount: number;
      budgetHint: number | null;
    }[],
  ): Promise<void>;
  demandItemsSince(
    sinceIso: string,
    filter?: { category?: CategoryId },
  ): Promise<DemandItemRow[]>;
  recentDemandItems(limit: number): Promise<RecentDemandItem[]>;
  updateListing(
    productId: string,
    patch: Pick<Product, 'title' | 'description' | 'tags' | 'attributes'>,
  ): Promise<Product>;
  undoListing(productId: string): Promise<Product | null>;
}
