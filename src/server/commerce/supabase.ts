import { HttpError } from '@/server/http';
import { readPages } from './paging';
import { demoTimestamp } from '@/server/today';
import { createDb } from '@/server/db';
import type {
  CommerceAdapter,
  ProductQuery,
} from '@/contract/commerce-adapter';
import type { CategoryId, KitPlan, PersonaId, Product } from '@/contract/types';
import {
  demandItemRowSchema,
  recentDemandItemSchema,
  personaSchema,
  voucherSchema,
  productSchema,
  shopSchema,
} from '@/contract/schemas';

/** Only SQL column names are converted; nested JSON documents already use contract keys. */
function contractRow(row: Record<string, unknown>) {
  return Object.fromEntries(
    Object.entries(row).map(([key, value]) => [
      key.replace(/_([a-z])/g, (_, letter: string) => letter.toUpperCase()),
      key.endsWith('_at') && typeof value === 'string'
        ? new Date(value).toISOString()
        : value,
    ]),
  );
}

export class SupabaseAdapter implements CommerceAdapter {
  constructor(private readonly db = createDb()) {}

  async getInsightAdvice(key: string, signature: string) {
    const { data, error } = await this.db
      .from('insight_advice')
      .select('advice')
      .eq('gap_key', key)
      .eq('counts_signature', signature)
      .maybeSingle();
    if (error) throw error;
    return data?.advice ?? null;
  }
  async saveInsightAdvice(key: string, signature: string, advice: string) {
    const { error } = await this.db
      .from('insight_advice')
      .upsert({ gap_key: key, counts_signature: signature, advice });
    if (error) throw error;
  }
  async listShops() {
    const { data, error } = await this.db.from('shops').select('*').order('id');
    if (error) throw error;
    return shopSchema.array().parse(data.map(contractRow));
  }

  async getProduct(id: string) {
    const { data, error } = await this.db
      .from('products')
      .select('*')
      .eq('id', id)
      .maybeSingle();
    if (error) throw error;
    return data ? productSchema.parse(contractRow(data)) : null;
  }

  async searchProducts(q: ProductQuery) {
    if (q.categories?.length === 0 || (q.limit !== undefined && q.limit <= 0))
      return [];
    let query = this.db.from('products').select('*').order('id');
    if (q.category !== undefined) query = query.eq('category', q.category);
    if (q.categories !== undefined) query = query.in('category', q.categories);
    if (q.tagsAny?.length) query = query.overlaps('tags', q.tagsAny);
    if (q.maxPrice !== undefined) query = query.lte('price', q.maxPrice);
    // Text includes array tags and literal punctuation, matching the memory seam exactly.
    const text = q.text?.trim().toLocaleLowerCase();
    const products = [];
    const pageSize = 1000;
    for (let offset = 0; ; offset += pageSize) {
      const remaining =
        text || q.limit === undefined
          ? pageSize
          : Math.min(pageSize, q.limit - products.length);
      const { data, error } = await query.range(offset, offset + remaining - 1);
      if (error) throw error;
      products.push(...productSchema.array().parse(data.map(contractRow)));
      if (
        data.length < remaining ||
        (!text && q.limit !== undefined && products.length >= q.limit)
      )
        break;
    }
    return products
      .filter(
        (p) =>
          !text ||
          `${p.title} ${p.description} ${p.tags.join(' ')}`
            .toLocaleLowerCase()
            .includes(text),
      )
      .slice(0, q.limit === undefined ? undefined : q.limit);
  }
  async getPersona(id: PersonaId) {
    if (id === 'guest')
      return personaSchema.parse({
        id: 'guest',
        name: 'Guest',
        address: null,
        favoriteShopIds: [],
        cart: [],
      });
    const { data, error } = await this.db
      .from('personas')
      .select('*')
      .eq('id', id)
      .maybeSingle();
    if (error) throw error;
    if (!data) throw new Error('Persona not found');
    return personaSchema.parse({
      id: data.id,
      name: data.name,
      address:
        data.district !== null && data.city !== null
          ? { district: data.district, city: data.city }
          : null,
      favoriteShopIds: data.favorite_shop_ids,
      cart: data.cart,
    });
  }

  async listVouchers(persona?: PersonaId) {
    let query = this.db.from('vouchers').select('*').order('id');
    query =
      persona && persona !== 'guest'
        ? query.or(`owner_persona.is.null,owner_persona.eq.${persona}`)
        : query.is('owner_persona', null);
    const { data, error } = await query;
    if (error) throw error;
    return voucherSchema.array().parse(data.map(contractRow));
  }

  async recordIntent(s: {
    query: string;
    plan: KitPlan;
    source: 'live' | 'seed';
  }) {
    const { data, error } = await this.db
      .from('intent_sessions')
      .insert({
        query: s.query,
        plan: s.plan,
        event: s.plan.event,
        language: s.plan.language,
        source: s.source,
        created_at: demoTimestamp(),
      })
      .select('id')
      .single();
    if (error) throw error;
    return { sessionId: data.id as string };
  }

  async recordDemandItems(
    sessionId: string,
    items: Parameters<CommerceAdapter['recordDemandItems']>[1],
  ) {
    const { data: session, error: sessionError } = await this.db
      .from('intent_sessions')
      .select('event,created_at')
      .eq('id', sessionId)
      .maybeSingle();
    if (sessionError) throw sessionError;
    if (!session) throw new Error('Intent session not found');
    if (!items.length) return;
    const { error } = await this.db.from('demand_items').insert(
      items.map(({ item, matchedCount, budgetHint }) => ({
        session_id: sessionId,
        event: session.event,
        created_at: session.created_at,
        need_label: item.needLabel,
        category: item.category,
        tags: item.mustHaveTags,
        matched_count: matchedCount,
        budget_hint: budgetHint,
      })),
    );
    if (error) throw error;
  }

  async demandItemsSince(sinceIso: string, filter?: { category?: CategoryId }) {
    const rows = await readPages('demandItemsSince', async (offset, size) => {
      let query = this.db
        .from('demand_items')
        .select('*')
        .gte('created_at', sinceIso)
        .order('id');
      if (filter?.category !== undefined)
        query = query.eq('category', filter.category);
      const { data, error } = await query.range(offset, offset + size - 1);
      if (error) throw error;
      return data;
    });
    return demandItemRowSchema.array().parse(rows.map(contractRow));
  }

  async recentDemandItems(limit: number) {
    if (limit <= 0) return [];
    const query = this.db
      .from('demand_items')
      .select('*,intent_sessions!inner(source)')
      .eq('intent_sessions.source', 'live')
      .lt('matched_count', 2)
      .order('created_at', { ascending: false })
      .order('id', { ascending: false });
    const rows = [];
    for (let offset = 0; offset < limit; offset += 1000) {
      const pageSize = Math.min(1000, limit - offset);
      const { data, error } = await query.range(offset, offset + pageSize - 1);
      if (error) throw error;
      rows.push(...data);
      if (data.length < pageSize) break;
    }
    return recentDemandItemSchema
      .array()
      .parse(rows.map((row) => ({ ...contractRow(row), source: 'live' })));
  }

  async updateListing(
    productId: string,
    patch: Pick<Product, 'title' | 'description' | 'tags' | 'attributes'>,
    expected?: Product,
  ) {
    if (expected) {
      const toRow = (p: object) =>
        Object.fromEntries(
          Object.entries(p).map(([k, v]) => [
            k.replace(/[A-Z]/g, (c) => '_' + c.toLowerCase()),
            v,
          ]),
        );
      const { data, error } = await this.db.rpc('kitly_apply_listing', {
        p_id: productId,
        p_expected: toRow(expected),
        p_snapshot: expected,
        p_patch: toRow(patch),
        p_updated_at: demoTimestamp(),
      });
      if (error) throw error;
      if (data.status !== 'ok')
        throw new HttpError(
          data.status === 'changed' ? 409 : 404,
          data.status === 'changed' ? 'listing_changed' : 'not_found',
          'Proposal used or listing changed',
        );
      return productSchema.parse(contractRow(data.product));
    }
    const original = await this.getProduct(productId);
    if (!original) throw new Error('Product not found');
    const updated = productSchema.parse({
      ...original,
      title: patch.title,
      description: patch.description,
      tags: patch.tags,
      attributes: patch.attributes,
      updatedForDemandAt: demoTimestamp(),
    });
    const { data: version, error: snapshotError } = await this.db
      .from('product_versions')
      .insert({ product_id: productId, snapshot: original })
      .select('id')
      .single();
    if (snapshotError) throw snapshotError;
    const { data, error } = await this.db
      .from('products')
      .update({
        title: updated.title,
        description: updated.description,
        tags: updated.tags,
        attributes: updated.attributes,
        updated_for_demand_at: updated.updatedForDemandAt,
      })
      .eq('id', productId)
      .select('*')
      .single();
    if (error) {
      const { error: cleanupError } = await this.db
        .from('product_versions')
        .delete()
        .eq('id', version.id);
      if (cleanupError)
        throw new AggregateError(
          [error, cleanupError],
          'Listing update and snapshot cleanup failed',
        );
      throw error;
    }
    return productSchema.parse(contractRow(data));
  }

  async undoListing(productId: string) {
    const { data: version, error: versionError } = await this.db
      .from('product_versions')
      .select('id,snapshot')
      .eq('product_id', productId)
      .order('id', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (versionError) throw versionError;
    if (!version) return null;
    const snapshot = productSchema.parse(version.snapshot);
    const row = Object.fromEntries(
      Object.entries(snapshot).map(([key, value]) => [
        key.replace(/[A-Z]/g, (letter) => `_${letter.toLowerCase()}`),
        value,
      ]),
    );
    const { data, error } = await this.db
      .from('products')
      .update(row)
      .eq('id', productId)
      .select('*')
      .single();
    if (error) throw error;
    const { error: deleteError } = await this.db
      .from('product_versions')
      .delete()
      .eq('id', version.id);
    if (deleteError) throw deleteError;
    return productSchema.parse(contractRow(data));
  }
}
