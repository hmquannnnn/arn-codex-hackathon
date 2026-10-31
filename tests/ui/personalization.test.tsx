import { afterEach, expect, it } from 'vitest';
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import threads from '@/contract/fixtures/threads.sample.json';
import { threadResponseSchema } from '@/contract/schemas';
import { KitScreen } from '@/components/kit/screen';
import { Conversation } from '@/components/kit/conversation';
import { PersonaChip } from '@/components/persona-chip';
import { MockKitApi } from '@/lib/client/kit-api';
const fixture = threadResponseSchema.parse(threads[0]);
afterEach(() => {
  cleanup();
  localStorage.clear();
});
it('persona chip loads wallet/address and switches to Guest', async () => {
  const api = new MockKitApi(0);
  render(<PersonaChip api={api} insideKit />);
  await screen.findByRole('button', {
    name: /Lan · Cau Giay, Hanoi · 2 vouchers/,
  });
  fireEvent.click(screen.getByRole('button', { name: /Lan ·/ }));
  fireEvent.click(screen.getByRole('menuitem', { name: 'Guest' }));
  await screen.findByRole('button', { name: '👤 Guest' });
  expect(screen.getByText('Applies to new kits')).toBeTruthy();
});
it('renders cart interest, wallet first, address and one latest follow-up', async () => {
  const api = new MockKitApi(0);
  for await (const event of api.run('School budget 1M')) void event;
  const id = (await api.listThreads()).threads[0].id;
  render(<KitScreen api={api} id={id} />);
  await screen.findByText('💛 In your cart');
  expect(screen.getByText('440.000₫')).toBeTruthy();
  expect(screen.getByText(/over your 400k limit by 40.000₫/)).toBeTruthy();
  expect(screen.getByText('Deliver to Cau Giay, Hanoi')).toBeTruthy();
  expect(screen.getByRole('button', { name: 'Switch to this' })).toBeTruthy();
  await screen.findByRole('button', { name: 'Choose express delivery' });
  const savings = screen.getByTestId('savings');
  expect(savings.firstElementChild?.textContent).toContain('🎟');
});
it('answer fixture adds a turn without changing the kit version and survives reload', async () => {
  const api = new MockKitApi(0);
  for await (const e of api.run('School budget 1M')) void e;
  const id = (await api.listThreads()).threads[0].id;
  render(<KitScreen api={api} id={id} />);
  await screen.findByLabelText('Kit version');
  fireEvent.change(screen.getByLabelText('Message Kitly'), {
    target: { value: 'Is this backpack really anti-hunchback?' },
  });
  fireEvent.click(screen.getByRole('button', { name: 'Send message' }));
  await screen.findByText(/The description mentions S-shaped straps/);
  expect(screen.getByLabelText('Kit version').textContent).toBe(
    'Version 1 of 1',
  );
  cleanup();
  render(<KitScreen api={api} id={id} />);
  await screen.findByText(/The description mentions S-shaped straps/);
  expect(screen.getAllByTestId('user-turn')).toHaveLength(2);
});
it('interleaves a saved answer after its version and disables old follow-ups', () => {
  const v = fixture.versions[0];
  const message = {
    threadId: v.threadId,
    afterVersion: 1,
    createdAt: '2026-09-02T08:01:00Z',
    userText: 'Question',
    answer: 'A saved answer',
    followUp: v.followUp,
  };
  render(
    <Conversation
      versions={[v]}
      messages={[message]}
      onSuggestion={() => {}}
    />,
  );
  const turns = screen.getAllByTestId('user-turn');
  expect(turns.map((n) => n.textContent)).toEqual([v.userText, 'Question']);
  const pills = screen.getAllByRole('button', {
    name: 'Choose express delivery',
  });
  expect((pills[0] as HTMLButtonElement).disabled).toBe(true);
  expect((pills[1] as HTMLButtonElement).disabled).toBe(false);
});
it('swap pill calls price without refine and uses the item label with a wall-clock system turn', async () => {
  const api = new MockKitApi(0);
  for await (const e of api.run('School budget 1M')) void e;
  const id = (await api.listThreads()).threads[0].id;
  let prices = 0,
    refines = 0;
  const original = api.run.bind(api);
  api.run = async function* (...args) {
    refines++;
    yield* original(...args);
  };
  const saved = await api.getThread(id);
  api.price = async () => {
    prices++;
    return {
      option: saved.versions[0].options.find((o) => o.profile === 'balanced')!,
    };
  };
  render(<KitScreen api={api} id={id} />);
  fireEvent.click(
    await screen.findByRole('button', { name: 'Switch to KidZone Lite' }),
  );
  await waitFor(() => expect(prices).toBe(1));
  expect(refines).toBe(0);
  await screen.findByText(
    /Switched Anti-hunchback backpack to KidZone Lite Backpack/,
  );
  expect(screen.getAllByTestId('user-turn').at(-1)?.textContent).toBe(
    'Switch to KidZone Lite',
  );
});
it('Guest kit hides cart interests, wallet and delivery address', async () => {
  const api = new MockKitApi(0);
  await api.setPersona('guest');
  for await (const e of api.run('School budget 1M')) void e;
  const id = (await api.listThreads()).threads[0].id;
  render(<KitScreen api={api} id={id} />);
  await screen.findByLabelText('Kit version');
  expect(screen.queryByText('💛 In your cart')).toBeNull();
  expect(screen.queryByText(/Deliver to/)).toBeNull();
  expect(screen.queryByText(/Your wallet voucher/)).toBeNull();
});
it('interest switch uses price response, hides the card and exposes Undo', async () => {
  const api = new MockKitApi(0);
  for await (const e of api.run('School budget 1M')) void e;
  const id = (await api.listThreads()).threads[0].id;
  const saved = await api.getThread(id);
  const option = saved.versions[0].options.find(
    (o) => o.profile === 'balanced',
  )!;
  const interest = option.interests![0];
  let picked = '';
  api.price = async (_id, selection) => {
    picked = selection.picks[interest.itemKey];
    return {
      option: {
        ...option,
        noMatch: option.noMatch.filter((g) => g.itemKey !== interest.itemKey),
        lines: [
          ...option.lines,
          {
            itemKey: interest.itemKey,
            product: interest.candidate.product,
            shop: interest.candidate.shop,
            quantity: 1,
            lineTotal: interest.candidate.product.price,
            reason: 'Closest match · missing anti-hunchback',
            alternatives: [],
          },
        ],
      },
    };
  };
  render(<KitScreen api={api} id={id} />);
  fireEvent.click(
    await screen.findByRole('button', { name: 'Switch to this' }),
  );
  await waitFor(() => expect(picked).toBe(interest.candidate.product.id));
  await waitFor(() => expect(screen.queryByText('💛 In your cart')).toBeNull());
  expect(
    within(screen.getByTestId('basket')).getByText(
      interest.candidate.product.title,
    ),
  ).toBeTruthy();
  expect(
    screen.getByRole('button', { name: 'Undo last basket edit' }),
  ).toBeTruthy();
});
