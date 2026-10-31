import { afterEach, expect, it, vi } from 'vitest';
import { withIdleTimeout } from '@/server/llm/idle';
import { FakeLLM } from '@/server/llm';

afterEach(() => vi.useRealTimers());
it('passes every text delta and completes without a leftover timer', async () => {
  vi.useFakeTimers();
  async function* source() {
    yield 'Hello ';
    yield 'Kitly';
  }
  const chunks: string[] = [];
  for await (const chunk of withIdleTimeout(source(), 100)) chunks.push(chunk);
  expect(chunks).toEqual(['Hello ', 'Kitly']);
  expect(vi.getTimerCount()).toBe(0);
});
it('rejects an idle stream, cancels pending upstream work and clears its timer', async () => {
  vi.useFakeTimers();
  let release: (() => void) | undefined;
  let closed = false;
  let cancelled = false;
  async function* source() {
    try {
      yield 'Partial ';
      await new Promise<void>((resolve) => {
        release = resolve;
      });
      yield 'late';
    } finally {
      closed = true;
    }
  }
  const stream = withIdleTimeout(source(), 100, () => {
    cancelled = true;
    release?.();
  });
  expect(await stream.next()).toMatchObject({ value: 'Partial ', done: false });
  const pending = stream.next();
  const failure = expect(pending).rejects.toThrow(/idle|delta/i);
  await vi.advanceTimersByTimeAsync(100);
  await failure;
  expect(cancelled).toBe(true);
  expect(closed).toBe(true);
  expect(vi.getTimerCount()).toBe(0);
}, 1000);
it('FakeLLM can yield partial explanation text then throw its scripted stream error', async () => {
  const fake = new FakeLLM(
    [],
    ['Partial ', new Error('scripted stream failure')],
  );
  const stream = fake.stream('test', []);
  expect(await stream.next()).toMatchObject({ value: 'Partial ', done: false });
  await expect(stream.next()).rejects.toThrow('scripted stream failure');
});
