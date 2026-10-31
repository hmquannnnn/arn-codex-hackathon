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

it.each(['remove', 'budget'])(
  'B8 %s retains saved Add anyway, swap and Fit drops; history/restore reproduces each saved basket',
  async (edit) => {
    const s = await setup();
    const first = await s.adjust({ type: 'set_budget', budget: 1500000 });
    const base = first.options.find(
      (o: { profile: string }) => o.profile === 'balanced',
    );
    const gap = base.noMatch.find((g: { closest?: unknown }) => g.closest);
    const line = base.lines.find(
      (l: { alternatives: unknown[] }) => l.alternatives.length,
    );
    const dropped = base.lines.find(
      (l: { itemKey: string }) => l.itemKey !== line.itemKey,
    )!.itemKey;
    const removed = base.lines.find(
      (l: { itemKey: string }) =>
        l.itemKey !== line.itemKey && l.itemKey !== dropped,
    )!.itemKey;
    const selection = {
      profile: 'balanced',
      picks: {
        [gap.itemKey]: gap.closest.candidate.product.id,
        [line.itemKey]: line.alternatives[0].product.id,
      },
      dropped: [dropped],
    };
    const priced = await s.handlers.price(s.request({ selection }));
    expect(priced.status).toBe(200);
    const before = (await priced.json()).option;
    const next = await s.adjust(
      edit === 'remove'
        ? { type: 'remove_item', itemKey: removed }
        : { type: 'set_budget', budget: 1200000 },
    );
    expect(next.selection).toEqual(selection);
    const option = next.options.find(
      (o: { profile: string }) => o.profile === 'balanced',
    );
    for (const [key, productId] of Object.entries(selection.picks))
      expect(
        option.lines.find((l: { itemKey: string }) => l.itemKey === key)
          ?.product.id,
      ).toBe(productId);
    expect(
      option.lines.some((l: { itemKey: string }) => l.itemKey === dropped),
    ).toBe(false);
    const history = await (
      await s.handlers.thread(
        new Request('http://localhost', {
          headers: { cookie: 'kitly_uid=alice' },
        }),
        s.threadId,
      )
    ).json();
    expect(
      history.versions[1].options.find(
        (o: { profile: string }) => o.profile === 'balanced',
      ),
    ).toEqual(before);
    const restored = await s.adjust({ type: 'restore_version', version: 2 });
    expect(restored.selection).toEqual(selection);
    expect(
      restored.options.find(
        (o: { profile: string }) => o.profile === 'balanced',
      ),
    ).toEqual(before);
  },
);

it('B8 prunes removed keys and invalidated choices but retains other saved choices', async () => {
  const s = await setup();
  const first = await s.adjust({ type: 'set_budget', budget: 1500000 });
  const base = first.options.find(
    (o: { profile: string }) => o.profile === 'balanced',
  );
  const gap = base.noMatch.find((g: { closest?: unknown }) => g.closest);
  const selection = {
    profile: 'balanced',
    picks: { [gap.itemKey]: gap.closest.candidate.product.id },
    dropped: [],
  };
  expect((await s.handlers.price(s.request({ selection }))).status).toBe(200);
  const changed = await s.adjust({
    type: 'set_deadline',
    deadline: '2026-09-02',
  });
  expect(changed.selection?.picks).toEqual({});
  const removed = await s.adjust({ type: 'remove_item', itemKey: gap.itemKey });
  expect(removed.selection?.picks).toEqual({});
});

it('B8 a budget refinement through chat retains the saved basket choices too', async () => {
  const { runRefine } = await import('@/server/refine');
  const s = await setup();
  const first = await s.adjust({ type: 'set_budget', budget: 1500000 });
  const option = first.options.find(
    (o: { profile: string }) => o.profile === 'balanced',
  );
  const gap = option.noMatch.find((g: { closest?: unknown }) => g.closest);
  const selection = {
    profile: 'balanced',
    picks: { [gap.itemKey]: gap.closest.candidate.product.id },
    dropped: [option.lines[0].itemKey],
  };
  expect((await s.handlers.price(s.request({ selection }))).status).toBe(200);
  for await (const e of runRefine(
    { threadId: s.threadId, owner: 'alice', message: 'Budget 1M' },
    {
      adapter: s.adapter,
      store: s.store,
      llm: new FakeLLM([
        { ...first.plan, budget: 1000000, intent: 'change_kit' },
      ]),
    },
  ))
    void e;
  const latest = (await s.store.getThread(s.threadId, 'alice'))!.versions.at(
    -1,
  )!;
  expect(latest.selection).toEqual(selection);
  const selected = latest.options.find((o) => o.profile === 'balanced')!;
  expect(
    selected.lines.find((l) => l.itemKey === gap.itemKey)?.product.id,
  ).toBe(selection.picks[gap.itemKey]);
  expect(selected.lines.some((l) => l.itemKey === selection.dropped[0])).toBe(
    false,
  );
});

it('B8 historical saved basket prices survive later catalog price changes', async () => {
  const s = await setup();
  const first = await s.adjust({ type: 'set_budget', budget: 1500000 });
  const base = first.options.find(
    (o: { profile: string }) => o.profile === 'balanced',
  );
  const gap = base.noMatch.find((g: { closest?: unknown }) => g.closest);
  const selection = {
    profile: 'balanced',
    picks: { [gap.itemKey]: gap.closest.candidate.product.id },
    dropped: [],
  };
  const priced = await s.handlers.price(s.request({ selection }));
  const snapshot = (await priced.json()).option;
  const adapter = new InMemoryAdapter({
    products: (await s.adapter.searchProducts({})).map((p) =>
      p.id === selection.picks[gap.itemKey]
        ? { ...p, price: p.price + 50000 }
        : p,
    ),
  });
  const later = createEditHandlers({ adapter, store: s.store });
  const response = await later.thread(
    new Request('http://localhost', { headers: { cookie: 'kitly_uid=alice' } }),
    s.threadId,
  );
  expect(response.status).toBe(200);
  const history = await response.json();
  expect(
    history.versions[1].options.find(
      (o: { profile: string }) => o.profile === 'balanced',
    ),
  ).toEqual(snapshot);
});

it('B8 a retained Premium refinement explains its actual selected total/status', async () => {
  const { runRefine } = await import('@/server/refine');
  const s = await setup();
  const first = await s.adjust({ type: 'set_budget', budget: 1500000 });
  expect(
    (
      await s.handlers.price(
        s.request({
          selection: { profile: 'premium', picks: {}, dropped: [] },
        }),
      )
    ).status,
  ).toBe(200);
  const llm = new FakeLLM([
    { ...first.plan, budget: 1000000, intent: 'change_kit' },
  ]);
  for await (const e of runRefine(
    { threadId: s.threadId, owner: 'alice', message: 'Budget 1M' },
    { adapter: s.adapter, store: s.store, llm },
  ))
    void e;
  const latest = (await s.store.getThread(s.threadId, 'alice'))!.versions.at(
    -1,
  )!;
  const facts = JSON.parse(
    llm.calls.find((c) => c.kind === 'stream')!.messages[1].content,
  );
  expect(facts.selected.profile).toBe('premium');
  expect(facts.selected.grandTotal).toBe(
    latest.options.find((o) => o.profile === 'premium')!.grandTotal,
  );
});
