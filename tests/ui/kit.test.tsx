import { afterEach, expect, it } from 'vitest';
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import { threadResponseSchema, kitEventSchema } from '@/contract/schemas';
import threads from '@/contract/fixtures/threads.sample.json';
import clarify from '@/contract/fixtures/kit.clarify.sample.json';
import { parseSSE } from '@/lib/client/sse';
import { noMatchText } from '@/lib/client/kit-text';
import { mergeOptions } from '@/lib/client/kit-compare';
import { KitPanel } from '@/components/kit/panel';
import { Conversation } from '@/components/kit/conversation';
import { MockKitApi } from '@/lib/client/kit-api';
import { KitScreen } from '@/components/kit/screen';
const thread = threadResponseSchema.parse(threads[0]);
afterEach(() => {
  cleanup();
  localStorage.clear();
});
it('parses UTF8, CRLF, multiline data and split boundaries', async () => {
  const content =
    'event: explanation\r\ndata: {"delta":\r\ndata: "chào"}\r\n\r\n';
  const bytes = new TextEncoder().encode(content);
  const stream = new ReadableStream<Uint8Array>({
    start(c) {
      for (const b of bytes) c.enqueue(new Uint8Array([b]));
      c.close();
    },
  });
  const events = [];
  for await (const e of parseSSE(stream)) events.push(e);
  expect(events).toEqual([{ event: 'explanation', data: { delta: 'chào' } }]);
});
it('rejects malformed SSE payloads rather than silently finishing', async () => {
  const stream = new ReadableStream<Uint8Array>({
    start(c) {
      c.enqueue(new TextEncoder().encode('event: explanation\ndata: nope\n\n'));
      c.close();
    },
  });
  await expect(
    (async () => {
      for await (const e of parseSSE(stream)) void e;
    })(),
  ).rejects.toThrow();
});
it('renders two user turns and puts exact-match gaps before basket rows with Balanced selected', () => {
  render(
    <>
      <Conversation versions={thread.versions} />
      <KitPanel
        version={thread.versions[1]}
        versions={thread.versions}
        onVersion={() => {}}
        onRestore={() => {}}
        onSwap={async () => {}}
        onAdd={() => {}}
      />
    </>,
  );
  expect(screen.getAllByTestId('user-turn')).toHaveLength(2);
  expect(screen.getByLabelText('Kit version')).toBeTruthy();
  expect(
    screen.getByRole('tab', { name: /Balanced/ }).getAttribute('aria-selected'),
  ).toBe('true');
  expect(screen.getByText('Missing: anti-hunchback')).toBeTruthy();
  expect(
    screen
      .getByTestId('no-match')
      .compareDocumentPosition(screen.getByTestId('basket')) &
      Node.DOCUMENT_POSITION_FOLLOWING,
  ).toBeTruthy();
});
it('renders Vietnamese gap text, uncovered needs and budget choices', () => {
  const version = structuredClone(thread.versions[0]);
  version.plan.language = 'vi';
  const item = version.plan.items.find((i) => i.key === 'backpack')!;
  expect(
    noMatchText(version.plan, {
      itemKey: item.key,
      needLabel: item.needLabel,
      reason: 'no_product_with_tags',
      closest: null,
    }),
  ).toContain('Chưa có');
  version.options.forEach((option) =>
    option.noMatch.push({
      itemKey: 'pet',
      needLabel: 'Dog bed',
      reason: 'no_category',
      closest: null,
    }),
  );
  render(
    <KitPanel
      version={version}
      versions={[version]}
      onVersion={() => {}}
      onRestore={() => {}}
      onSwap={async () => {}}
      onAdd={() => {}}
    />,
  );
  expect(screen.getByText(/Not in store yet/)).toBeTruthy();
  expect(screen.getByText(/^Chưa có/)).toBeTruthy();
  cleanup();
  const plan = clarify
    .map((e) => kitEventSchema.parse(e))
    .find((e) => e.event === 'plan')!;
  const pending = {
    ...version,
    plan: plan.event === 'plan' ? plan.data.plan : version.plan,
    status: 'awaiting_budget' as const,
    options: [],
  };
  render(<Conversation versions={[pending]} onBudget={() => {}} />);
  expect(screen.getAllByRole('button')).toHaveLength(4);
  expect(screen.getByText('No limit')).toBeTruthy();
});
it('merges identical baskets', () => {
  const option = thread.versions[0].options[0];
  expect(
    mergeOptions([option, { ...option, profile: 'premium' }]),
  ).toHaveLength(1);
});
it('mock API persists each new and refined thread and isolates separate kits', async () => {
  const api = new MockKitApi();
  const events = [];
  for await (const e of api.run('School with budget 1.5M')) events.push(e);
  const done = events.find((e) => e.event === 'done')!;
  if (done.event !== 'done') throw new Error('missing done');
  for await (const e of api.run('Remove uniform', done.data.threadId)) void e;
  expect(
    (await new MockKitApi().getThread(done.data.threadId)).versions,
  ).toHaveLength(2);
  expect((await api.listThreads()).threads).toHaveLength(1);
});
it('late read-back preserves the next live user bubble while applying saved turns', async () => {
  const api = new MockKitApi(0);
  const original = api.getThread.bind(api);
  let release: (() => void) | undefined;
  let calls = 0;
  api.getThread = async (id) => {
    const saved = await original(id);
    if (++calls === 1)
      await new Promise<void>((resolve) => {
        release = resolve;
      });
    return saved;
  };
  const liveRun = api.run.bind(api);
  let releaseRun: (() => void) | undefined;
  api.run = async function* (text, id, signal) {
    if (id)
      await new Promise<void>((resolve) => {
        releaseRun = resolve;
      });
    yield* liveRun(text, id, signal);
  };
  render(<KitScreen api={api} />);
  fireEvent.change(screen.getByLabelText('Message Kitly'), {
    target: { value: 'School budget 1.5M' },
  });
  fireEvent.click(screen.getByRole('button', { name: 'Send message' }));
  await waitFor(() => expect(release).toBeTruthy());
  fireEvent.change(screen.getByLabelText('Message Kitly'), {
    target: { value: 'Remove uniform now' },
  });
  fireEvent.click(screen.getByRole('button', { name: 'Send message' }));
  await waitFor(() => expect(releaseRun).toBeTruthy());
  release!();
  await waitFor(() => {
    const turns = screen
      .getAllByTestId('user-turn')
      .map((node) => node.textContent);
    expect(turns).toContain('School budget 1.5M');
    expect(turns).toContain('Remove uniform now');
  });
  releaseRun!();
});
it('auto-starts a query once under React StrictMode effect replay', async () => {
  const { StrictMode } = await import('react');
  const api = new MockKitApi(1);
  render(
    <StrictMode>
      <KitScreen api={api} query="School budget 1M" onNavigate={() => {}} />
    </StrictMode>,
  );
  await waitFor(async () =>
    expect((await api.listThreads()).threads).toHaveLength(1),
  );
  await waitFor(() =>
    expect(screen.getAllByTestId('user-turn')).toHaveLength(1),
  );
});
