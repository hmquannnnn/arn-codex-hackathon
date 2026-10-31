import { expect, it } from 'vitest';
import { InMemoryAdapter } from '@/server/commerce';
import { matchPlan } from '@/server/matcher';
import { optimizeProfiles } from '@/server/optimizer';
import { kitPlanSchema } from '@/contract/schemas';
import fixture from '@/contract/fixtures/kit.sample.json';
import { findInterests } from '@/server/kit/interests';
const plan = kitPlanSchema.parse(
  fixture.find((e) => e.event === 'plan')!.data.plan,
);
export async function heroContext() {
  const adapter = new InMemoryAdapter(),
    matched = await matchPlan(plan, adapter),
    persona = await adapter.getPersona('lan'),
    vouchers = await adapter.listVouchers('lan');
  const option = optimizeProfiles({
    plan,
    candidates: matched.candidates,
    noMatch: matched.noMatch,
    vouchers,
  }).find((o) => o.profile === 'balanced')!;
  option.interests = findInterests(
    plan,
    option,
    matched.related,
    persona,
    vouchers,
    '2026-09-02',
  );
  return { adapter, matched, persona, vouchers, option, plan };
}
it('S10 Lan wallet lowers the same basket; cart interest reports440k,40k excess and missing anti-hunchback without entering lines', async () => {
  const { adapter, matched, persona, vouchers, option } = await heroContext();
  const guest = await adapter.getPersona('guest');
  const guestOption = optimizeProfiles({
    plan,
    candidates: matched.candidates,
    noMatch: matched.noMatch,
    vouchers: await adapter.listVouchers('guest'),
  }).find((o) => o.profile === 'balanced')!;
  expect(
    option.savings.some((s) => s.wallet && s.label.includes('Back-to-school')),
  ).toBe(true);
  expect(guestOption.grandTotal).toBeGreaterThan(option.grandTotal);
  expect(guestOption.savings.some((s) => s.wallet)).toBe(false);
  expect(option.interests).toContainEqual(
    expect.objectContaining({
      itemKey: 'backpack',
      walletVoucherCode: 'LAN-KZ80',
      priceAfterVoucher: 440000,
      overMaxPriceBy: 40000,
      missingTags: ['anti-hunchback'],
    }),
  );
  expect(
    option.lines.some((l) => l.product.id === 'prod-kidzone-lite-backpack'),
  ).toBe(false);
  expect(
    findInterests(
      plan,
      guestOption,
      matched.related,
      guest,
      vouchers,
      '2026-09-02',
    ),
  ).toEqual([]);
  expect(persona.id).toBe('lan');
});
it('S10 sales hooks are priority ordered, express never offers express again, guest has no personal facts', async () => {
  const { buildSalesContext } = await import('@/server/kit/sales-context');
  const { adapter, persona, vouchers, option } = await heroContext();
  const context = buildSalesContext(
    plan,
    option,
    persona,
    vouchers,
    '2026-09-02',
  );
  expect(context.daysLeft).toBe(3);
  expect(context.hooks.slice(0, 3)).toEqual([
    'deadline_soon',
    'cart_interest',
    'voucher_expiring',
  ]);
  expect(context.address).toBe('Cau Giay, Hanoi');
  expect(
    buildSalesContext(
      { ...plan, deadline: '2026-09-04' },
      option,
      persona,
      vouchers,
      '2026-09-02',
    ).hooks,
  ).not.toContain('deadline_soon');
  const guest = buildSalesContext(
    plan,
    option,
    await adapter.getPersona('guest'),
    vouchers,
    '2026-09-02',
  );
  expect([
    guest.address,
    guest.interests,
    guest.walletVouchers,
    guest.favoriteShopPromos,
  ]).toEqual([null, [], [], []]);
});
it('S10 follow-up accepts only grounded numbers/codes and attaches/shortens interest swap actions', async () => {
  const { followUp } = await import('@/server/kit/follow-up');
  const { buildSalesContext } = await import('@/server/kit/sales-context');
  const { FakeLLM } = await import('@/server/llm');
  const { persona, vouchers, option } = await heroContext();
  const context = buildSalesContext(
    plan,
    option,
    persona,
    vouchers,
    '2026-09-02',
  );
  const input = { plan, option, context, message: 'School kit' };
  const suggestion = {
    text: 'Switch to KidZone Lite Backpack Grade 1–3',
    interestItemKey: 'backpack',
    swapProductId: null,
  };
  const ask = async (question: string) =>
    followUp(
      new FakeLLM([
        {
          question,
          suggestions: [
            suggestion,
            {
              text: 'Keep this kit',
              interestItemKey: null,
              swapProductId: null,
            },
          ],
        },
      ]),
      input,
    );
  expect((await ask('Want the backpack for399.000₫?')).source).toBe('template');
  expect((await ask('Want440.000₫ with LAN-KZ80?')).source).toBe('llm');
  expect((await ask('Keep the backpack under400k?')).source).toBe('llm');
  expect((await ask('Keep it under400.000₫?')).source).toBe('llm');
  expect((await ask('Want350k?')).source).toBe('template');
  const good = await ask('Want440.000₫ with LAN-KZ80?');
  expect(good.suggestions[0].text.length).toBeLessThanOrEqual(40);
  expect(good.suggestions[0].action).toEqual({
    type: 'swap',
    itemKey: 'backpack',
    productId: 'prod-kidzone-lite-backpack',
  });
  expect((await followUp(new FakeLLM(), input)).source).toBe('template');
});
it('S10 kit/refine/adjust/price use the thread persona, persist interests, followup fallback precedes done', async () => {
  const { InMemoryKitStore } = await import('@/server/kits');
  const { FakeLLM } = await import('@/server/llm');
  const { runKit } = await import('@/server/pipeline');
  const { createEditHandlers } = await import('@/server/kit/edits');
  const { kitEventSchema } = await import('@/contract/schemas');
  const adapter = new InMemoryAdapter(),
    store = new InMemoryKitStore(),
    llm = new FakeLLM([plan], ['Your kit.']);
  const events = [];
  for await (const event of runKit(
    { query: 'School kit', owner: 'alice', persona: 'lan' },
    { adapter, store, llm },
  ))
    events.push(kitEventSchema.parse(event));
  expect(events.slice(-2).map((e) => e.event)).toEqual(['followup', 'done']);
  const threadId = (await store.listThreads('alice'))[0].id;
  expect(
    (await store.getThread(threadId, 'alice'))?.versions[0].followUp?.source,
  ).toBe('template');
  const handlers = createEditHandlers({ adapter, store });
  const request = (body: object) =>
    new Request('http://localhost/api/kit', {
      method: 'POST',
      headers: {
        cookie: 'kitly_uid=alice; kitly_persona=guest',
        'content-type': 'application/json',
      },
      body: JSON.stringify({ threadId, ...body }),
    });
  const adjusted = await handlers.adjust(
    request({ change: { type: 'set_budget', budget: 1500000 } }),
  );
  const version = (await adjusted.json()).version;
  expect(
    version.options.find((o: { profile: string }) => o.profile === 'balanced')
      .interests[0].walletVoucherCode,
  ).toBe('LAN-KZ80');
  expect(version.followUp).toBeNull();
  const priced = await handlers.price(
    request({
      selection: {
        profile: 'balanced',
        picks: { backpack: 'prod-kidzone-lite-backpack' },
        dropped: [],
      },
    }),
  );
  expect(priced.status).toBe(200);
  const { option } = await priced.json();
  expect(
    option.shops.find((s: { shopId: string }) => s.shopId === 'shop-kidzone')
      .voucherCodes,
  ).toContain('LAN-KZ80');
});
it('S10 answer turns stream grounded product/alternative facts and persist a message without version or demand', async () => {
  const { InMemoryKitStore } = await import('@/server/kits');
  const { FakeLLM } = await import('@/server/llm');
  const { runKit } = await import('@/server/pipeline');
  const { runRefine } = await import('@/server/refine');
  const adapter = new InMemoryAdapter(),
    store = new InMemoryKitStore();
  for await (const e of runKit(
    { query: 'School kit', owner: 'alice', persona: 'lan' },
    { adapter, store, llm: new FakeLLM([plan]) },
  ))
    void e;
  const threadId = (await store.listThreads('alice'))[0].id;
  const before = await adapter.demandItemsSince('2000-01-01');
  const llm = new FakeLLM(
    [{ ...plan, intent: 'answer' }],
    [
      'The description supports a straight spine, but the anti-hunchback tag is missing.',
    ],
  );
  const events = [];
  for await (const e of runRefine(
    {
      threadId,
      owner: 'alice',
      message: 'Is the backpack anti-hunchback? Any better lunch box?',
    },
    { adapter, store, llm },
  ))
    events.push(e);
  expect(events.map((e) => e.event)).toEqual([
    'step',
    'explanation',
    'followup',
    'done',
  ]);
  expect(events.at(-1)).toMatchObject({
    data: { answered: true, version: 1, sessionId: null },
  });
  const thread = await store.getThread(threadId, 'alice');
  expect(thread?.versions).toHaveLength(1);
  expect(thread?.messages).toHaveLength(1);
  expect(await adapter.demandItemsSince('2000-01-01')).toEqual(before);
  const facts = JSON.parse(
    llm.calls
      .find((c) => c.kind === 'stream')!
      .messages.find((m) => m.role === 'user')!.content,
  );
  expect(
    facts.products.some((p: { description: string }) =>
      p.description.includes('spine straight'),
    ),
  ).toBe(true);
  expect(facts.alternatives[0]).toHaveProperty('grandTotal');
  expect(facts.alternatives[0]).toHaveProperty('overBy');
});
it('S10 follow-up includes alternatives and express context; valid alternative pills swap, ungrounded switch pills are dropped', async () => {
  const { followUp } = await import('@/server/kit/follow-up');
  const { alternativeFacts } = await import('@/server/kit/alternatives');
  const { buildSalesContext } = await import('@/server/kit/sales-context');
  const { FakeLLM } = await import('@/server/llm');
  const { persona, vouchers, option, matched } = await heroContext();
  const alternatives = alternativeFacts(plan, option, matched, vouchers),
    alt = alternatives[0];
  const llm = new FakeLLM([
    {
      question: 'Want a different option?',
      suggestions: [
        {
          text: 'Switch to this alternative',
          swapProductId: alt.productId,
          interestItemKey: null,
        },
        {
          text: 'Upgrade lunch box',
          swapProductId: null,
          interestItemKey: null,
        },
        { text: 'Keep this kit', swapProductId: null, interestItemKey: null },
      ],
    },
  ]);
  const result = await followUp(llm, {
    plan,
    option,
    alternatives,
    context: buildSalesContext(
      { ...plan, deadline: '2026-09-04' },
      option,
      persona,
      vouchers,
      '2026-09-02',
    ),
    message: 'Better lunch box?',
  });
  expect(result.source).toBe('llm');
  expect(result.suggestions).toHaveLength(2);
  expect(result.suggestions[0].action).toEqual({
    type: 'swap',
    itemKey: alt.itemKey,
    productId: alt.productId,
  });
  const prompt = llm.calls[0].messages.map((m) => m.content).join('\n');
  expect(prompt).toContain('already express');
  expect(prompt).toContain(option.lines[0].product.title);
  expect(prompt).toContain(option.noMatch[0].needLabel);
  expect(prompt).toContain(String(alt.grandTotal));
});
it('S10 follow-up templates cover every hook in English and Vietnamese and reject wrong dates/codes/missingquestion', async () => {
  const { followUp, templateFollowUp } = await import('@/server/kit/follow-up');
  const { buildSalesContext } = await import('@/server/kit/sales-context');
  const { FakeLLM } = await import('@/server/llm');
  const { persona, vouchers, option } = await heroContext();
  const context = buildSalesContext(
    plan,
    option,
    persona,
    vouchers,
    '2026-09-02',
  );
  const hooks = [
    'deadline_soon',
    'cart_interest',
    'voucher_expiring',
    'freeship_gap',
    'favorite_shop_promo',
  ] as const;
  for (const hook of [...hooks, undefined]) {
    const input = {
      plan,
      option,
      context: { ...context, hooks: hook ? [hook] : [] },
      message: '',
    };
    const en = templateFollowUp(input),
      vi = templateFollowUp({ ...input, plan: { ...plan, language: 'vi' } });
    expect(en.question.endsWith('?')).toBe(true);
    expect(vi.question.endsWith('?')).toBe(true);
    expect(vi.question).not.toBe(en.question);
    expect(en.suggestions).toHaveLength(2);
  }
  for (const question of [
    'Try LAN-FAKE50?',
    'Deliver on2026-09-12?',
    'Deliver Sep12?',
    'This is not a question',
  ]) {
    const result = await followUp(
      new FakeLLM([
        {
          question,
          suggestions: [
            { text: 'Yes', interestItemKey: null, swapProductId: null },
            { text: 'Keep', interestItemKey: null, swapProductId: null },
          ],
        },
      ]),
      { plan, option, context, message: '' },
    );
    expect(result.source).toBe('template');
  }
});
it('S10 follow-up and explainer run concurrently, not in series', async () => {
  const { InMemoryKitStore } = await import('@/server/kits');
  const { FakeLLM } = await import('@/server/llm');
  const { runKit } = await import('@/server/pipeline');
  class DelayedFake extends FakeLLM {
    override async structured<T>(
      ...args: Parameters<FakeLLM['structured']>
    ): Promise<T> {
      if (this.calls.length) await new Promise((r) => setTimeout(r, 150));
      return super.structured(...args) as Promise<T>;
    }
    override async *stream(...args: Parameters<FakeLLM['stream']>) {
      await new Promise((r) => setTimeout(r, 150));
      yield* super.stream(...args);
    }
  }
  const llm = new DelayedFake(
    [
      plan,
      {
        question: 'Keep this kit?',
        suggestions: [
          {
            text: 'Lower the budget',
            interestItemKey: null,
            swapProductId: null,
          },
          { text: 'Keep this kit', interestItemKey: null, swapProductId: null },
        ],
      },
    ],
    ['Ready.'],
  );
  const start = performance.now(),
    events = [];
  for await (const e of runKit(
    { query: 'School kit', owner: 'alice', persona: 'lan' },
    { adapter: new InMemoryAdapter(), store: new InMemoryKitStore(), llm },
  ))
    events.push(e);
  expect(performance.now() - start).toBeLessThan(260);
  expect(events.slice(-2).map((e) => e.event)).toEqual(['followup', 'done']);
});
it('S10 a stalled follow-up falls back after8seconds without failing the kit', async () => {
  const { vi } = await import('vitest');
  const { followUp } = await import('@/server/kit/follow-up');
  const { FakeLLM } = await import('@/server/llm');
  const { buildSalesContext } = await import('@/server/kit/sales-context');
  const { option, persona, vouchers } = await heroContext();
  class StalledFake extends FakeLLM {
    override structured<T>(): Promise<T> {
      return new Promise(() => {});
    }
  }
  vi.useFakeTimers();
  try {
    const promise = followUp(new StalledFake(), {
      plan,
      option,
      context: buildSalesContext(plan, option, persona, vouchers, '2026-09-02'),
      message: '',
    });
    await vi.advanceTimersByTimeAsync(8001);
    expect((await promise).source).toBe('template');
  } finally {
    vi.useRealTimers();
  }
});
it('S10 guard rejects prefix/alphabetic voucher inventions and prices found only in listing prose', async () => {
  const { followUp } = await import('@/server/kit/follow-up');
  const { buildSalesContext } = await import('@/server/kit/sales-context');
  const { FakeLLM } = await import('@/server/llm');
  const { option, persona, vouchers } = await heroContext();
  const changed = structuredClone(option);
  changed.lines[0].product.description += ' Suggested price399000 VND.';
  const input = {
    plan,
    option: changed,
    context: buildSalesContext(plan, option, persona, vouchers, '2026-09-02'),
    message: '',
  };
  for (const question of [
    'Use LAN-KZ8?',
    'Use LAN-FAKE?',
    'Use voucher FAKESHIP?',
    'Pay399.000₫?',
  ]) {
    const result = await followUp(
      new FakeLLM([
        {
          question,
          suggestions: [
            {
              text: 'Keep this kit',
              interestItemKey: null,
              swapProductId: null,
            },
            {
              text: 'Lower the budget',
              interestItemKey: null,
              swapProductId: null,
            },
          ],
        },
      ]),
      input,
    );
    expect(result.source, question).toBe('template');
  }
});
it('S10 favorite shop promos survive when the favorite has no chosen line/cart card; expired wallet offers stay out', async () => {
  const { buildSalesContext } = await import('@/server/kit/sales-context');
  const { adapter, persona, vouchers, option } = await heroContext();
  const empty = { ...option, lines: [], shops: [], interests: [] };
  const context = buildSalesContext(
    plan,
    empty,
    persona,
    vouchers,
    '2026-09-02',
    await adapter.listShops(),
  );
  expect(
    context.favoriteShopPromos.some(
      (p) => p.shopName === 'KidZone Mall' && p.code === 'LAN-KZ80',
    ),
  ).toBe(true);
  expect(
    buildSalesContext(
      plan,
      empty,
      persona,
      vouchers,
      '2026-10-10',
      await adapter.listShops(),
    ).walletVouchers,
  ).toEqual([]);
});
