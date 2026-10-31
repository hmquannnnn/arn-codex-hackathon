import { NextResponse } from 'next/server';
/** Edge-compatible gate; disabled unless explicitly configured. */
export function basicAuth(request: Request): NextResponse | null {
  const expected = process.env.KITLY_BASIC_AUTH;
  if (!expected) return null;
  const header = request.headers.get('authorization');
  if (header?.startsWith('Basic ')) {
    try {
      const decoded = new TextDecoder().decode(
        Uint8Array.from(atob(header.slice(6)), (c) => c.charCodeAt(0)),
      );
      if (decoded === expected) return null;
    } catch {
      /* Malformed credentials receive the same challenge as absent credentials. */
    }
  }
  return new NextResponse('Authentication required', {
    status: 401,
    headers: {
      'WWW-Authenticate': 'Basic realm="Kitly", charset="UTF-8"',
      'Cache-Control': 'no-store',
    },
  });
}
