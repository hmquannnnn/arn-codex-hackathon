import { expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import { SupabaseAdapter } from '@/server/commerce';
import { SupabaseKitStore } from '@/server/kits';
import { createEditHandlers } from '@/server/kit/edits';
import { kitVersionSchema } from '@/contract/schemas';
import { createDb } from '@/server/db';
import threads from '@/contract/fixtures/threads.sample.json';
it.skipIf(process.env.KITLY_TEST_EDITS !== '1')(
  'S6/S9 real seeded adjust/price persist across instances under1s',
  async () => {
    const owner = 'test-edits-' + randomUUID(),
      store = new SupabaseKitStore(),
      adapter = new SupabaseAdapter();
    const { threadId } = await store.createThread(owner, 'Edit smoke', 'lan');
    try {
      const {
        version: _v,
        createdAt: _t,
        ...base
      } = kitVersionSchema.parse(threads[0].versions[0]);
      await store.appendVersion({ ...base, threadId }, owner);
      const handlers = createEditHandlers({ store, adapter });
      const request = (body: object) =>
        new Request('http://localhost/api/kit', {
          method: 'POST',
          headers: {
            cookie: `kitly_uid=${owner}; kitly_persona=guest`,
            'content-type': 'application/json',
          },
          body: JSON.stringify({ threadId, ...body }),
        });
      let start = performance.now();
      const response = await handlers.adjust(
        request({ change: { type: 'set_budget', budget: 1000000 } }),
      );
      const ms = performance.now() - start;
      expect(response.status).toBe(200);
      console.info('seeded adjust ms', ms);
      const { version } = await response.json();
      expect(version.plan.budget).toBe(1000000);
      start = performance.now();
      const priced = await handlers.price(
        request({ selection: { profile: 'balanced', picks: {}, dropped: [] } }),
      );
      const priceMs = performance.now() - start;
      console.info('seeded price ms', priceMs);
      expect(priced.status).toBe(200);
      expect(
        (await new SupabaseKitStore().getThread(threadId, owner))?.versions.at(
          -1,
        )?.selection?.profile,
      ).toBe('balanced');
      expect(ms).toBeLessThan(1000);
      expect(priceMs).toBeLessThan(1000);
    } finally {
      await createDb()
        .from('kit_threads')
        .delete()
        .eq('id', threadId)
        .eq('owner', owner);
    }
  },
  30000,
);
