import { randomUUID } from 'node:crypto';
import { expect, it } from 'vitest';
import { createRefineHandler } from '@/server/sse';
import { InMemoryAdapter } from '@/server/commerce';
import { InMemoryKitStore } from '@/server/kits';
import { FakeLLM } from '@/server/llm';
import { kitEventSchema, kitVersionSchema } from '@/contract/schemas';
import { maxDuration } from '@/app/api/kit/refine/route';
import type { CommerceAdapter } from '@/contract/commerce-adapter';
import fixture from '@/contract/fixtures/threads.sample.json';
class CountingAdapter extends InMemoryAdapter {
  intents = 0;
  override async recordIntent(
    input: Parameters<CommerceAdapter['recordIntent']>[0],
  ) {
    this.intents++;
    return super.recordIntent(input);
  }
}
const request = (body: unknown, owner = 'alice') =>
  new Request('http://localhost/api/kit/refine', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      cookie: `kitly_uid=${owner}; kitly_persona=guest`,
    },
    body: JSON.stringify(body),
  });
async function setup() {
  const store = new InMemoryKitStore();
  const { threadId } = await store.createThread('alice', 'School kit', 'lan');
  const {
    version: _v,
    createdAt: _t,
    ...base
  } = kitVersionSchema.parse(fixture[0].versions[0]);
  await store.appendVersion({ ...base, threadId }, 'alice');
  const adapter = new CountingAdapter();
  return { store, adapter, threadId, base };
}
it('returns JSON404 before SSE or any planner/session write for malformed, missing and other-owner threads', async () => {
  const { store, adapter, threadId } = await setup();
  const llm = new FakeLLM();
  const handler = createRefineHandler({ store, adapter, llm });
  for (const [id, owner] of [
    ['not-a-uuid', 'alice'],
    [randomUUID(), 'alice'],
    [threadId, 'bob'],
  ]) {
    const response = await handler(
      request({ threadId: id, message: 'Budget1M' }, owner),
    );
    expect(response.status).toBe(404);
    expect(response.headers.get('content-type')).toContain('application/json');
    expect(await response.json()).toEqual({
      error: { code: 'not_found', message: 'Kit not found' },
    });
  }
  expect(llm.calls).toHaveLength(0);
  expect(adapter.intents).toBe(0);
  expect((await store.getThread(threadId, 'alice'))?.versions).toHaveLength(1);
});
it('streams version2 with diff and uses the stored persona wallet instead of the switched cookie', async () => {
  const { store, adapter, threadId, base } = await setup();
  const next = {
    ...base.plan,
    budget: 1000000,
    items: base.plan.items.filter((item) => item.key !== 'uniform-shirt'),
  };
  const llm = new FakeLLM(
    [{ ...next, intent: 'change_kit' }],
    ['Uniform removed; the new total fits 1M.'],
  );
  const response = await createRefineHandler({ store, adapter, llm })(
    request({
      threadId,
      message: 'School gives uniform, budget1M',
      profiles: ['balanced'],
    }),
  );
  expect(response.status).toBe(200);
  expect(response.headers.get('content-type')).toContain('text/event-stream');
  const events = (await response.text())
    .trim()
    .split('\n\n')
    .map((frame) => {
      const [event, data] = frame.split('\n');
      return kitEventSchema.parse({
        event: event.slice(7),
        data: JSON.parse(data.slice(6)),
      });
    });
  expect(events.find((event) => event.event === 'plan')).toMatchObject({
    data: { threadId, version: 2, diff: { removed: ['uniform-shirt'] } },
  });
  const options = events.find((event) => event.event === 'options');
  if (options?.event !== 'options') throw new Error('No options');
  expect(options.data.options[0].savings.some((saving) => saving.wallet)).toBe(
    true,
  );
  expect(events.at(-1)).toMatchObject({
    event: 'done',
    data: { threadId, version: 2 },
  });
  expect(adapter.intents).toBe(1);
  expect((await store.getThread(threadId, 'alice'))?.versions[1].kind).toBe(
    'refine',
  );
  expect(maxDuration).toBe(120);
});
