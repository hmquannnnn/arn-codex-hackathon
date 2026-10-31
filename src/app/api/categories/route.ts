import { NextResponse } from 'next/server';
import { categories } from '@/contract/taxonomy';
export async function GET() {
  return NextResponse.json({ categories });
}
