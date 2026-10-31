import { expect, it } from 'vitest';
import { createKitHandler } from '@/server/sse';
import { InMemoryAdapter } from '@/server/commerce';
import { InMemoryKitStore } from '@/server/kits';
import { FakeLLM } from '@/server/llm';
import { kitEventSchema, kitPlanSchema } from '@/contract/schemas';
import threads from '@/contract/fixtures/threads.sample.json';
import { maxDuration } from '@/app/api/kit/route';
const request = (
  body: string,
  cookie = 'kitly_uid=alice; kitly_persona=guest',
) =>
  new Request('http://localhost/api/kit', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', cookie },
    body,
  });
it('POST returns schema-valid SSE with requested profile, cookie ownership and guest persona', async () => {
  const store = new InMemoryKitStore();
  const handler = createKitHandler({
    adapter: new InMemoryAdapter(),
    store,
    llm: new FakeLLM(
      [kitPlanSchema.parse(threads[0].versions[0].plan)],
      ['Ready.'],
    ),
  });
  const response = await handler(
    request(
      JSON.stringify({ query: 'Grade1 budget1.5M', profiles: ['premium'] }),
    ),
  );
  expect(response.status).toBe(200);
  expect(response.headers.get('content-type')).toContain('text/event-stream');
  expect(response.headers.get('cache-control')).toContain('no-cache');
  expect(response.headers.get('x-accel-buffering')).toBe('no');
  const frames = (await response.text()).trim().split('\n\n');
  const events = frames.map((frame) => {
    const [event, data] = frame.split('\n');
    return kitEventSchema.parse({
      event: event.slice(7),
      data: JSON.parse(data.slice(6)),
    });
  });
  const done = events.at(-1);
  if (done?.event !== 'done') throw new Error('No done');
  expect(events.find((event) => event.event === 'options')).toMatchObject({
    data: { options: [{ profile: 'premium' }] },
  });
  expect(
    (await store.getThread(done.data.threadId, 'alice'))?.thread.persona,
  ).toBe('guest');
  expect(await store.getThread(done.data.threadId, 'bob')).toBeNull();
  expect(maxDuration).toBe(120);
});
it('rejects malformed requests and missing owner before creating a thread or calling the model', async () => {
  const store = new InMemoryKitStore();
  const llm = new FakeLLM();
  const handler = createKitHandler({
    adapter: new InMemoryAdapter(),
    store,
    llm,
  });
  for (const body of [
    '{',
    '{}',
    '{"query":""}',
    '{"query":"a","profiles":["bad"]}',
  ]) {
    const response = await handler(request(body));
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({
      error: { code: 'invalid_request', message: 'Invalid request' },
    });
  }
  expect((await handler(request('{"query":"a"}', ''))).status).toBe(400);
  expect(await store.listThreads('alice')).toEqual([]);
  expect(llm.calls).toHaveLength(0);
});
