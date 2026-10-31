import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { GET as products } from '@/app/api/products/route';
import { GET as product } from '@/app/api/products/[id]/route';
import { GET as shops } from '@/app/api/shops/route';
import { GET as categories } from '@/app/api/categories/route';
import { POST as checkout } from '@/app/api/checkout/route';
import { GET as persona, POST as switchPersona } from '@/app/api/persona/route';
import {
  categoriesResponseSchema,
  checkoutResponseSchema,
  errorResponseSchema,
  personaResponseSchema,
  productResponseSchema,
  productsResponseSchema,
  shopsResponseSchema,
} from '@/contract/schemas';
const request = (path: string, body?: unknown, cookie?: string) =>
  new Request('http://localhost' + path, {
    method: body === undefined ? 'GET' : 'POST',
    headers: {
      ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
      ...(cookie ? { cookie } : {}),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
beforeEach(() => vi.stubEnv('KITLY_ADAPTER', 'memory'));
afterEach(() => vi.unstubAllEnvs());
it('GET products returns joined products and honors query/category/limit', async () => {
  const r = await products(
    request('/api/products?q=Minh%20An&category=school-backpack&limit=1'),
  );
  expect(r.status).toBe(200);
  expect(productsResponseSchema.parse(await r.json()).products).toMatchObject([
    { id: 'prod-minhan-backpack', shop: { id: 'shop-minhan' } },
  ]);
  const invalid = await products(request('/api/products?limit=-1'));
  expect(invalid.status).toBe(400);
  errorResponseSchema.parse(await invalid.json());
  const none = await products(request('/api/products?q=nonexistent'));
  expect(await none.json()).toEqual({ products: [] });
});
it('GET product includes shop and applicable persona vouchers, missing id returns JSON 404', async () => {
  const r = await product(request('/api/products/prod-kidzone-lite-backpack'), {
    params: Promise.resolve({ id: 'prod-kidzone-lite-backpack' }),
  });
  expect(r.status).toBe(200);
  const data = productResponseSchema.parse(await r.json());
  expect(data.shop.id).toBe('shop-kidzone');
  expect(data.vouchers.some((v) => v.code === 'LAN-KZ80')).toBe(true);
  const missing = await product(request('/api/products/missing'), {
    params: Promise.resolve({ id: 'missing' }),
  });
  expect(missing.status).toBe(404);
  errorResponseSchema.parse(await missing.json());
});
it('GET shops and categories match the frozen response contracts', async () => {
  const s = await shops();
  expect(s.status).toBe(200);
  expect(shopsResponseSchema.parse(await s.json()).shops).toHaveLength(7);
  const c = await categories();
  expect(c.status).toBe(200);
  expect(
    categoriesResponseSchema.parse(await c.json()).categories,
  ).toHaveLength(60);
});
it('POST checkout prices catalog items, one shipping fee per shop and eligible vouchers', async () => {
  const r = await checkout(
    request('/api/checkout', {
      lines: [
        { productId: 'prod-minhan-backpack', quantity: 1 },
        { productId: 'prod-minhan-notebooks', quantity: 2 },
      ],
    }),
  );
  expect(r.status).toBe(200);
  expect(checkoutResponseSchema.parse(await r.json())).toMatchObject({
    grandTotal: 389000,
  });
});
it.each([
  [{ lines: [] }, 400],
  [{ lines: [{ productId: 'prod-minhan-backpack', quantity: 0 }] }, 400],
  [{ lines: [{ productId: 'missing', quantity: 1 }] }, 404],
  [{ lines: [{ productId: 'prod-minhan-backpack', quantity: 121 }] }, 409],
  [
    {
      lines: [
        { productId: 'prod-minhan-backpack', quantity: 70 },
        { productId: 'prod-minhan-backpack', quantity: 70 },
      ],
    },
    409,
  ],
])('checkout rejects invalid or unavailable lines %#', async (body, status) => {
  const r = await checkout(request('/api/checkout', body));
  expect(r.status).toBe(status);
  errorResponseSchema.parse(await r.json());
});
it('POST checkout rejects malformed JSON with the error envelope', async () => {
  const r = await checkout(
    new Request('http://localhost/api/checkout', { method: 'POST', body: '{' }),
  );
  expect(r.status).toBe(400);
  errorResponseSchema.parse(await r.json());
});
it('persona endpoints default to Lan and switch to Guest using a SameSite cookie', async () => {
  const r = await persona(request('/api/persona'));
  expect(r.status).toBe(200);
  const lan = personaResponseSchema.parse(await r.json());
  expect(lan.persona.id).toBe('lan');
  expect(lan.walletVouchers).toHaveLength(2);
  const guest = await switchPersona(request('/api/persona', { id: 'guest' }));
  expect(guest.status).toBe(200);
  expect(guest.headers.get('set-cookie')).toMatch(
    /kitly_persona=guest;.*Max-Age=31536000;.*SameSite=lax/i,
  );
  expect(personaResponseSchema.parse(await guest.json())).toMatchObject({
    persona: { id: 'guest' },
    walletVouchers: [],
  });
  const getGuest = await persona(
    request('/api/persona', undefined, 'kitly_persona=guest'),
  );
  expect(
    personaResponseSchema.parse(await getGuest.json()).walletVouchers,
  ).toEqual([]);
  const bad = await switchPersona(request('/api/persona', { id: 'other' }));
  expect(bad.status).toBe(400);
  errorResponseSchema.parse(await bad.json());
});
it('missing backend credentials return a safe error without leaking server config', async () => {
  vi.stubEnv('KITLY_ADAPTER', 'supabase');
  vi.stubEnv('SUPABASE_URL', '');
  const r = await products(request('/api/products'));
  expect(r.status).toBe(503);
  expect(errorResponseSchema.parse(await r.json()).error.code).toBe(
    'unavailable',
  );
});
