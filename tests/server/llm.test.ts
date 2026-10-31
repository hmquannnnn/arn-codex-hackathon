import { createServer, type Server } from 'node:http';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { z } from 'zod';
import { OpenAILLM, FakeLLM, getModels } from '@/server/llm';
let server: Server;
let bodies: Record<string, unknown>[];
let mode: 'ok' | 'invalid' | 'stall' | 'error';
beforeEach(async () => {
  bodies = [];
  mode = 'ok';
  server = createServer(async (req, res) => {
    let raw = '';
    for await (const chunk of req) raw += chunk;
    const body = JSON.parse(raw);
    bodies.push(body);
    if (mode === 'error') {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: { message: 'temporary' } }));
      return;
    }
    if (body.stream) {
      res.writeHead(200, { 'Content-Type': 'text/event-stream' });
      // IDs deliberately differ: raw deltas must work with proxies rewriting response IDs.
      res.write(
        'event: response.output_text.delta\ndata: ' +
          JSON.stringify({
            type: 'response.output_text.delta',
            response_id: 'proxy-id',
            delta: 'Hello ',
          }) +
          '\n\n',
      );
      if (mode === 'stall') return;
      res.write(
        'event: response.output_text.delta\ndata: ' +
          JSON.stringify({
            type: 'response.output_text.delta',
            response_id: 'other-id',
            delta: 'Kitly',
          }) +
          '\n\n',
      );
      res.end('data: [DONE]\n\n');
      return;
    }
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(
      JSON.stringify({
        id: 'r1',
        object: 'response',
        status: 'completed',
        output: [
          {
            type: 'message',
            role: 'assistant',
            content: [
              {
                type: 'output_text',
                text: mode === 'invalid' ? '{}' : '{"ok":true}',
                annotations: [],
              },
            ],
          },
        ],
      }),
    );
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  if (!address || typeof address === 'string') throw Error('address');
  vi.stubEnv('OPENAI_BASE_URL', `http://127.0.0.1:${address.port}/v1`);
  vi.stubEnv('OPENAI_API_KEY', 'local-test-only');
});
afterEach(async () => {
  vi.useRealTimers();
  server.closeAllConnections();
  await new Promise<void>((resolve) => server.close(() => resolve()));
  vi.unstubAllEnvs();
});
it.each(['fast', ''])(
  'uses the configured HTTP endpoint and sends service_tier only when non-empty (%s)',
  async (tier) => {
    vi.stubEnv('KITLY_SERVICE_TIER', tier);
    const llm = new OpenAILLM();
    expect(
      await llm.structured(
        'test-model',
        z.object({ ok: z.boolean() }),
        [{ role: 'user', content: 'test' }],
        { effort: 'low' },
      ),
    ).toEqual({ ok: true });
    let text = '';
    for await (const delta of llm.stream(
      'test-model',
      [{ role: 'user', content: 'test' }],
      { effort: 'medium' },
    ))
      text += delta;
    expect(text).toBe('Hello Kitly');
    expect(bodies).toHaveLength(2);
    for (const body of bodies) {
      expect(body.model).toBe('test-model');
      if (tier) expect(body.service_tier).toBe('fast');
      else expect(body).not.toHaveProperty('service_tier');
    }
    expect(bodies[0].reasoning).toEqual({ effort: 'low' });
    expect(bodies[1].reasoning).toEqual({ effort: 'medium' });
    expect(bodies[0].text).toMatchObject({
      format: {
        type: 'json_schema',
        strict: true,
        schema: { additionalProperties: false },
      },
    });
    expect(bodies[1].stream).toBe(true);
  },
);
it('defaults service tier to fast and omits reasoning when no effort was given', async () => {
  vi.stubEnv('KITLY_SERVICE_TIER', undefined);
  const llm = new OpenAILLM();
  await llm.structured('test', z.object({ ok: z.boolean() }), []);
  expect(bodies[0].service_tier).toBe('fast');
  expect(bodies[0]).not.toHaveProperty('reasoning');
});
it('rejects invalid structured responses and retries server failures once', async () => {
  const llm = new OpenAILLM();
  mode = 'invalid';
  await expect(
    llm.structured('test', z.object({ ok: z.boolean() }), []),
  ).rejects.toThrow();
  mode = 'error';
  bodies = [];
  await expect(
    llm.structured('test', z.object({ ok: z.boolean() }), []),
  ).rejects.toThrow();
  expect(bodies).toHaveLength(2);
});
it('aborts a stream after 20 seconds without a text delta', async () => {
  mode = 'stall';
  const llm = new OpenAILLM();
  const stream = llm.stream('test', []);
  expect(await stream.next()).toMatchObject({ value: 'Hello ', done: false });
  await expect(stream.next()).rejects.toThrow(/abort|delta|idle/i);
}, 30000);
it('FakeLLM validates scripted output and records efforts without network calls', async () => {
  const fake = new FakeLLM([{ ok: true }], ['One', ' two']);
  expect(
    await fake.structured('fake', z.object({ ok: z.boolean() }), [], {
      effort: 'low',
    }),
  ).toEqual({ ok: true });
  const chunks = [];
  for await (const delta of fake.stream('fake', [], { effort: 'high' }))
    chunks.push(delta);
  expect(chunks).toEqual(['One', ' two']);
  expect(fake.calls.map((c) => c.effort)).toEqual(['low', 'high']);
  await expect(
    fake.structured('fake', z.object({ ok: z.boolean() }), []),
  ).rejects.toThrow();
});
it('reads model/effort settings from env with the agreed defaults', () => {
  vi.stubEnv('KITLY_MODEL_PLANNER', undefined);
  vi.stubEnv('KITLY_MODEL_FAST', undefined);
  vi.stubEnv('KITLY_PLANNER_EFFORT', undefined);
  vi.stubEnv('KITLY_FAST_EFFORT', undefined);
  expect(getModels()).toEqual({
    planner: 'gpt-6-luna',
    fast: 'gpt-6-luna',
    plannerEffort: 'low',
    fastEffort: 'low',
  });
  vi.stubEnv('KITLY_MODEL_FAST', 'custom-fast');
  vi.stubEnv('KITLY_FAST_EFFORT', 'high');
  expect(getModels()).toMatchObject({
    fast: 'custom-fast',
    fastEffort: 'high',
  });
});
