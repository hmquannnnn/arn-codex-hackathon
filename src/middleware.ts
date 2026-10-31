import { NextRequest, NextResponse } from 'next/server';
import { basicAuth } from './server/basic-auth';
export function middleware(request: NextRequest) {
  const challenge = basicAuth(request);
  if (challenge) return challenge;
  if (request.cookies.has('kitly_uid')) return NextResponse.next();
  const owner = crypto.randomUUID();
  request.cookies.set('kitly_uid', owner);
  const response = NextResponse.next({ request: { headers: request.headers } });
  response.cookies.set('kitly_uid', owner, {
    httpOnly: true,
    sameSite: 'lax',
    maxAge: 31536000,
    path: '/',
    secure: request.nextUrl.protocol === 'https:',
  });
  return response;
}
export const config = { matcher: ['/((?!_next/static|_next/image).*)'] };
