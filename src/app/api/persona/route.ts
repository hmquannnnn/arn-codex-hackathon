import { NextResponse } from 'next/server';
import { personaRequestSchema } from '@/contract/schemas';
import { getAdapter } from '@/server/commerce';
import { personaFrom } from '@/server/identity';
import { jsonEndpoint } from '@/server/http';
import type { PersonaId } from '@/contract/types';
export const dynamic = 'force-dynamic';
async function personaResponse(id: PersonaId) {
  const adapter = getAdapter();
  const [persona, vouchers] = await Promise.all([
    adapter.getPersona(id),
    adapter.listVouchers(id),
  ]);
  return NextResponse.json({
    persona,
    walletVouchers: vouchers.filter((v) => v.ownerPersona === id),
  });
}
export async function GET(request: Request) {
  return jsonEndpoint(() => personaResponse(personaFrom(request)));
}
export async function POST(request: Request) {
  return jsonEndpoint(async () => {
    const { id } = personaRequestSchema.parse(await request.json());
    const response = await personaResponse(id);
    response.cookies.set('kitly_persona', id, {
      sameSite: 'lax',
      maxAge: 31536000,
      path: '/',
      secure: new URL(request.url).protocol === 'https:',
    });
    return response;
  });
}
