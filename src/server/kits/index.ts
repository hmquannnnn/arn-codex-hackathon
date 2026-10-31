import type { KitStore } from '@/contract/kit-store';
import { InMemoryKitStore } from './in-memory';
import { SupabaseKitStore } from './supabase';
export { SupabaseKitStore } from './supabase';
export { InMemoryKitStore } from './in-memory';
let memory: InMemoryKitStore | undefined;
export function getKitStore(): KitStore {
  const adapter = process.env.KITLY_ADAPTER || 'supabase';
  if (adapter === 'memory') return (memory ??= new InMemoryKitStore());
  if (adapter === 'supabase') return new SupabaseKitStore();
  throw new Error('Unknown KITLY_ADAPTER');
}
