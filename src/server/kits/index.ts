import type { KitStore } from '@/contract/kit-store';
import { InMemoryKitStore } from './in-memory';
export { InMemoryKitStore } from './in-memory';
let memory: InMemoryKitStore | undefined;
export function getKitStore(): KitStore {
  const adapter = process.env.KITLY_ADAPTER || 'supabase';
  if (adapter === 'memory') return (memory ??= new InMemoryKitStore());
  if (adapter === 'supabase')
    throw new Error('Supabase KitStore not implemented until ticket 01');
  throw new Error('Unknown KITLY_ADAPTER');
}
