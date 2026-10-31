import type { DemandWatches } from '@/server/demand/watch';
import type { InsightAdviceCache } from './advice-cache';
import type { CommerceAdapter } from '@/contract/commerce-adapter';
import { InMemoryAdapter } from './in-memory';
import { SupabaseAdapter } from './supabase';
export { SupabaseAdapter } from './supabase';
export { InMemoryAdapter } from './in-memory';
let memory: InMemoryAdapter | undefined;
export function getAdapter(): CommerceAdapter &
  InsightAdviceCache &
  DemandWatches {
  const adapter = process.env.KITLY_ADAPTER || 'supabase';
  if (adapter === 'memory') return (memory ??= new InMemoryAdapter());
  if (adapter === 'supabase') return new SupabaseAdapter();
  throw new Error('Unknown KITLY_ADAPTER');
}
