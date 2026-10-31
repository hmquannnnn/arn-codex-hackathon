import { expect, it } from 'vitest';
import { InMemoryAdapter } from '@/server/commerce';
import { InMemoryKitStore } from '@/server/kits';
import { FakeLLM } from '@/server/llm';
import { kitVersionSchema } from '@/contract/schemas';
import threads from '@/contract/fixtures/threads.sample.json';
import { createEditHandlers } from '@/server/kit/edits';

async function setup(awaiting = false) {
  const adapter = new InMemoryAdapter(),
    store = new InMemoryKitStore(),
    llm = new FakeLLM();
  const { threadId } = await store.createThread('alice', 'School kit', 'lan');
  const {
    version: _v,
    createdAt: _t,
    ...base
  } = kitVersionSchema.parse(threads[0].versions[0]);
  await store.appendVersion(
    {
      ...base,
      threadId,
      status: awaiting ? 'awaiting_budget' : 'ready',
      plan: { ...base.plan, budget: awaiting ? null : 1000000 },
    },
    'alice',
  );
  const handlers = createEditHandlers({ adapter, store });
  const request = (body: unknown, owner = 'alice') =>
    new Request('http://localhost/api/kit', {
      method: 'POST',
      headers: {
        cookie: `kitly_uid=${owner}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({ threadId, ...(body as object) }),
    });
  const adjust = async (change: unknown) => {
    const response = await handlers.adjust(request({ change }));
    expect(response.status).toBe(200);
    return (await response.json()).version;
  };
  return { adapter, store, llm, threadId, handlers, request, adjust, base };
}
it('S6 remove/restore round trip and restore_version preserve historical plan without LLM, under100ms', async () => {
  const s = await setup();
  const start = performance.now();
  const key = s.base.plan.items[0].key;
  const removed = await s.adjust({ type: 'remove_item', itemKey: key });
  expect(removed.excludedKeys).toContain(key);
  expect(removed.plan.items.some((i: { key: string }) => i.key === key)).toBe(
    false,
  );
  const restored = await s.adjust({ type: 'restore_item', itemKey: key });
  expect(restored.plan.items).toEqual(s.base.plan.items);
  await s.adjust({ type: 'set_budget', budget: 200000 });
  const old = await s.adjust({ type: 'restore_version', version: 1 });
  expect(old.plan.budget).toBe(1000000);
  expect(old.kind).toBe('restore');
  expect(old.followUp).toBeNull();
  expect(s.llm.calls).toEqual([]);
  expect(performance.now() - start).toBeLessThan(100);
});
it('S6 budget clarification records demand exactly once, including no-limit budget', async () => {
  const s = await setup(true);
  const before = (await s.adapter.demandItemsSince('2000-01-01')).length;
  const first = await s.adjust({ type: 'set_budget', budget: null });
  expect(first.status).toBe('ready');
  expect(first.options).toHaveLength(3);
  expect((await s.adapter.demandItemsSince('2000-01-01')).length - before).toBe(
    s.base.plan.items.length,
  );
  await s.adjust({ type: 'set_budget', budget: 500000 });
  expect((await s.adapter.demandItemsSince('2000-01-01')).length - before).toBe(
    s.base.plan.items.length,
  );
});
it('S6 history and edits enforce owner isolation, invalid picks return400 and selection persists without version', async () => {
  const s = await setup();
  expect(
    (
      await s.handlers.adjust(
        s.request({ change: { type: 'set_budget', budget: 1 } }, 'bob'),
      )
    ).status,
  ).toBe(404);
  expect(
    (
      await s.handlers.thread(
        new Request('http://localhost', {
          headers: { cookie: 'kitly_uid=bob' },
        }),
        s.threadId,
      )
    ).status,
  ).toBe(404);
  const version = await s.adjust({ type: 'set_budget', budget: 1000000 });
  const selection = { profile: 'balanced', picks: {}, dropped: [] };
  const start = performance.now();
  const response = await s.handlers.price(s.request({ selection }));
  expect(response.status).toBe(200);
  expect(performance.now() - start).toBeLessThan(100);
  expect(
    (await s.store.getThread(s.threadId, 'alice'))?.versions.at(-1)?.selection,
  ).toEqual(selection);
  expect((await s.store.getThread(s.threadId, 'alice'))?.versions).toHaveLength(
    version.version,
  );
  expect(
    (
      await s.handlers.price(
        s.request({
          selection: {
            ...selection,
            picks: { [s.base.plan.items[0].key]: 'invented' },
          },
        }),
      )
    ).status,
  ).toBe(400);
});
it('S6 Vietnamese code-only adjustments explain the action in Vietnamese', async () => {
  const s = await setup();
  const first = (await s.store.getThread(s.threadId, 'alice'))!.versions[0];
  const { version: _v, createdAt: _t, ...base } = first;
  await s.store.appendVersion(
    { ...base, plan: { ...base.plan, language: 'vi' } },
    'alice',
  );
  const version = await s.adjust({ type: 'set_budget', budget: 750000 });
  expect(version.explanation).toContain('Đã đổi ngân sách');
  expect(version.explanation).not.toContain('set_budget');
});
it('S6 non-budget edits keep clarification awaiting without demand', async () => {
  const s = await setup(true),
    before = await s.adapter.demandItemsSince('2000-01-01');
  const version = await s.adjust({
    type: 'remove_item',
    itemKey: s.base.plan.items[0].key,
  });
  expect(version.status).toBe('awaiting_budget');
  expect(version.options).toEqual([]);
  expect(await s.adapter.demandItemsSince('2000-01-01')).toEqual(before);
});
