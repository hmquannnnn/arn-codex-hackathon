import { NextRequest } from 'next/server';
import type { PersonaId } from '@/contract/types';
export function ownerFrom(request: Request): string {
  const owner = new NextRequest(request).cookies.get('kitly_uid')?.value;
  if (!owner) throw new Error('Browser owner cookie missing');
  return owner;
}
export function personaFrom(request: Request): PersonaId {
  return new NextRequest(request).cookies.get('kitly_persona')?.value ===
    'guest'
    ? 'guest'
    : 'lan';
}
