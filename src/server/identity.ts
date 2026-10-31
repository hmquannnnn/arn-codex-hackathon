import { NextRequest } from 'next/server';
import type { PersonaId } from '@/contract/types';

/** Inspect headers without transferring or locking a caller's POST body stream. */
function cookiesFor(request: Request) {
  return new NextRequest(request.url, { headers: request.headers }).cookies;
}
export function ownerFrom(request: Request): string {
  const owner = cookiesFor(request).get('kitly_uid')?.value;
  if (!owner) throw new Error('Browser owner cookie missing');
  return owner;
}
export function personaFrom(request: Request): PersonaId {
  return cookiesFor(request).get('kitly_persona')?.value === 'guest'
    ? 'guest'
    : 'lan';
}
