import { afterEach, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { middleware } from '@/middleware';
import { ownerFrom, personaFrom } from '@/server/identity';
const req = (cookie?: string, authorization?: string) =>
  new NextRequest('http://localhost/api/products', {
    headers: {
      ...(cookie ? { cookie } : {}),
      ...(authorization ? { authorization } : {}),
    },
  });
afterEach(() => vi.unstubAllEnvs());
it('sets a browser owner once and passes it to the current request', () => {
  vi.stubEnv('KITLY_BASIC_AUTH', '');
  const response = middleware(req());
  const cookie = response.cookies.get('kitly_uid');
  expect(cookie?.value).toMatch(/^[0-9a-f-]{36}$/);
  expect(cookie).toMatchObject({
    httpOnly: true,
    sameSite: 'lax',
    maxAge: 31536000,
    path: '/',
  });
  expect(response.headers.get('x-middleware-request-cookie')).toContain(
    `kitly_uid=${cookie?.value}`,
  );
  expect(ownerFrom(req(`kitly_uid=${cookie?.value}`))).toBe(cookie?.value);
  expect(
    middleware(req(`kitly_uid=${cookie?.value}`)).cookies.get('kitly_uid'),
  ).toBeUndefined();
  expect(() => ownerFrom(req())).toThrow(/owner/i);
});
it('defaults missing or invalid persona cookies to Lan', () => {
  expect(personaFrom(req())).toBe('lan');
  expect(personaFrom(req('kitly_persona=invalid'))).toBe('lan');
  expect(personaFrom(req('kitly_persona=guest'))).toBe('guest');
});
it('opens without Basic Auth, challenges missing/wrong auth, and accepts the exact credentials', () => {
  vi.stubEnv('KITLY_BASIC_AUTH', '');
  expect(middleware(req()).status).toBe(200);
  vi.stubEnv('KITLY_BASIC_AUTH', 'demo:secret');
  for (const auth of [
    undefined,
    'Basic ' + btoa('demo:wrong'),
    'Bearer invalid',
    'Basic !!!',
  ]) {
    const response = middleware(req(undefined, auth));
    expect(response.status).toBe(401);
    expect(response.headers.get('www-authenticate')).toContain('Basic');
    expect(response.cookies.get('kitly_uid')).toBeUndefined();
  }
  expect(
    middleware(req(undefined, 'Basic ' + btoa('demo:secret'))).status,
  ).toBe(200);
});
