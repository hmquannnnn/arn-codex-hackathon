import type { CommerceAdapter } from '@/contract/commerce-adapter';
import { InMemoryAdapter } from './in-memory';
export { InMemoryAdapter } from './in-memory';
let memory: InMemoryAdapter | undefined;
export function getAdapter(): CommerceAdapter {
  const adapter = process.env.KITLY_ADAPTER || 'supabase';
  if (adapter === 'memory') return (memory ??= new InMemoryAdapter());
  if (adapter === 'supabase')
    throw new Error('Supabase adapter not implemented until ticket 01');
  throw new Error('Unknown KITLY_ADAPTER');
}
