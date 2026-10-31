import type { CommerceAdapter } from '@/contract/commerce-adapter';
import { InMemoryAdapter } from './in-memory';
import { SupabaseAdapter } from './supabase';
export { SupabaseAdapter } from './supabase';
export { InMemoryAdapter } from './in-memory';
let memory: InMemoryAdapter | undefined;
export function getAdapter(): CommerceAdapter {
  const adapter = process.env.KITLY_ADAPTER || 'supabase';
  if (adapter === 'memory') return (memory ??= new InMemoryAdapter());
  if (adapter === 'supabase') return new SupabaseAdapter();
  throw new Error('Unknown KITLY_ADAPTER');
}
