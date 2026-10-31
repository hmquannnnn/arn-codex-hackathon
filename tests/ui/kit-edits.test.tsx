import { afterEach, expect, it } from 'vitest';
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import { useState } from 'react';
import { threadResponseSchema, basketOptionSchema } from '@/contract/schemas';
import type { BasketOption, KitSelection } from '@/contract/types';
import threads from '@/contract/fixtures/threads.sample.json';
import overBudget from '@/contract/fixtures/kit.over-budget.sample.json';
import { KitPanel } from '@/components/kit/panel';
import { Conversation } from '@/components/kit/conversation';
import { KitScreen } from '@/components/kit/screen';
import { MockKitApi } from '@/lib/client/kit-api';
import { applyFit, pickProduct } from '@/lib/client/kit-selection';
const thread = threadResponseSchema.parse(threads[0]);
afterEach(() => {
  cleanup();
  localStorage.clear();
});
const noop = () => {};
it('over-budget fixture offers two fit suggestions and keeps checkout enabled', () => {
  const version = {
    ...thread.versions[0],
    plan: { ...thread.versions[0].plan, budget: 200000 },
    options: [basketOptionSchema.parse(overBudget)],
  };
  render(
    <KitPanel
      version={version}
      versions={[version]}
      onVersion={noop}
      onRestore={noop}
      onSwap={async () => {}}
      onAdd={noop}
    />,
  );
  expect(screen.getByText('Over budget by 635.000₫')).toBeTruthy();
  expect(
    screen.getAllByRole('button', { name: /Keep notebooks/ }),
  ).toHaveLength(2);
  expect(
    (
      screen.getByRole('button', {
        name: 'Add kit to cart (over budget by 635.000₫)',
      }) as HTMLButtonElement
    ).disabled,
  ).toBe(false);
  expect(screen.getAllByText('removes a must-have')).toHaveLength(2);
});
it('Add anyway uses returned option, shows honest closest label, and permits removal', async () => {
  const base = structuredClone(thread.versions[0]);
  const balanced = base.options.find((o) => o.profile === 'balanced')!;
  const gap = balanced.noMatch.find((g) => g.closest)!;
  const closest = gap.closest!.candidate;
  const result: BasketOption = {
    ...balanced,
    noMatch: balanced.noMatch.filter((g) => g.itemKey !== gap.itemKey),
    lines: [
      ...balanced.lines,
      {
        itemKey: gap.itemKey,
        product: closest.product,
        shop: closest.shop,
        quantity: 1,
        lineTotal: closest.product.price,
        reason: 'Closest match · missing anti-hunchback',
        alternatives: [],
      },
    ],
    grandTotal: 1184000,
  };
  let sent: KitSelection | undefined;
  let removed = '';
  function Harness() {
    const [v, setV] = useState(base);
    return (
      <KitPanel
        version={v}
        versions={[v]}
        onVersion={noop}
        onRestore={noop}
        onSwap={async () => {}}
        onAdd={noop}
        onRemove={(key) => {
          removed = key;
        }}
        onSelect={async (selection) => {
          sent = selection;
          setV({ ...v, selection, options: [result] });
          return result;
        }}
      />
    );
  }
  render(<Harness />);
  fireEvent.click(screen.getByRole('button', { name: 'Add anyway' }));
  await waitFor(() =>
    expect(
      within(screen.getByTestId('basket')).getByText(
        'Closest match · missing anti-hunchback',
      ),
    ).toBeTruthy(),
  );
  expect(sent?.picks[gap.itemKey]).toBe(closest.product.id);
  fireEvent.click(
    screen.getByRole('button', { name: `Remove ${closest.product.title}` }),
  );
  expect(removed).toBe(gap.itemKey);
});
it('remove response creates a system turn with Undo, restore sends the original key', async () => {
  const api = new MockKitApi(0);
  for await (const e of api.run('School budget 1M')) void e;
  const id = (await api.listThreads()).threads[0].id;
  const original = await api.getThread(id);
  const saved = structuredClone(original);
  let restored = '';
  api.getThread = async () => structuredClone(saved);
  api.adjust = async (_id, change) => {
    const previous = saved.versions.at(-1)!;
    const version = structuredClone(previous);
    version.version++;
    version.kind = 'adjust';
    if (change.type === 'remove_item') {
      version.excludedKeys = [change.itemKey];
      version.plan.items = version.plan.items.filter(
        (i) => i.key !== change.itemKey,
      );
      version.options = version.options.map((o) => ({
        ...o,
        lines: o.lines.filter((l) => l.itemKey !== change.itemKey),
      }));
      version.explanation = 'Removed: Water bottle';
    }
    if (change.type === 'restore_item') {
      restored = change.itemKey;
      version.excludedKeys = [];
      version.explanation = 'Restored: Water bottle';
    }
    saved.versions.push(version);
    saved.thread.versionCount = version.version;
    return { version };
  };
  render(<KitScreen api={api} id={id} />);
  await waitFor(() =>
    expect(
      screen.getByRole('button', {
        name: 'Remove KidZone Premium Water bottle',
      }),
    ).toBeTruthy(),
  );
  fireEvent.click(
    screen.getByRole('button', { name: 'Remove KidZone Premium Water bottle' }),
  );
  await waitFor(() =>
    expect(screen.getByText(/Removed: Water bottle/)).toBeTruthy(),
  );
  fireEvent.click(
    screen.getByRole('button', { name: 'Undo removal of Water bottle' }),
  );
  await waitFor(() => expect(restored).toBe('water-bottle'));
});
it('selection transforms preserve prior edits and remove conflicting picks', () => {
  const base: KitSelection = {
    profile: 'balanced',
    picks: { backpack: 'x', bottle: 'y' },
    dropped: ['pens'],
  };
  expect(pickProduct(base, 'pens', 'z')).toEqual({
    ...base,
    picks: { ...base.picks, pens: 'z' },
    dropped: [],
  });
  expect(
    applyFit(base, {
      id: 'fit',
      label: 'Fit',
      removeItemKeys: ['bottle'],
      swaps: [{ itemKey: 'pens', productId: 'z' }],
      grandTotal: 1,
      fits: true,
      dropsMustHave: false,
    }),
  ).toEqual({
    profile: 'balanced',
    picks: { backpack: 'x', pens: 'z' },
    dropped: ['bottle'],
  });
});
it('inline budget/deadline and assumption edits send exact requests', async () => {
  let change: unknown;
  let message = '';
  const v = thread.versions[0];
  render(
    <>
      <KitPanel
        version={v}
        versions={[v]}
        onVersion={noop}
        onRestore={noop}
        onSwap={async () => {}}
        onAdd={noop}
        onAdjust={async (value) => {
          change = value;
        }}
      />
      <Conversation
        versions={[v]}
        onRefine={(text) => {
          message = text;
        }}
      />
    </>,
  );
  fireEvent.click(screen.getByRole('button', { name: 'Edit budget' }));
  fireEvent.change(screen.getByLabelText('Budget in VND'), {
    target: { value: '1000000' },
  });
  fireEvent.keyDown(screen.getByLabelText('Budget in VND'), { key: 'Enter' });
  await waitFor(() =>
    expect(change).toEqual({ type: 'set_budget', budget: 1000000 }),
  );
  fireEvent.click(screen.getByRole('button', { name: 'Edit deadline' }));
  fireEvent.change(screen.getByLabelText('Delivery deadline'), {
    target: { value: '2026-09-04' },
  });
  fireEvent.keyDown(screen.getByLabelText('Delivery deadline'), {
    key: 'Enter',
  });
  await waitFor(() =>
    expect(change).toEqual({ type: 'set_deadline', deadline: '2026-09-04' }),
  );
  fireEvent.click(
    screen.getByRole('button', { name: 'Edit assumption: 1 child' }),
  );
  fireEvent.change(screen.getByLabelText('Assumption'), {
    target: { value: '2 children' },
  });
  fireEvent.keyDown(screen.getByLabelText('Assumption'), { key: 'Enter' });
  expect(message).toBe('"1 child" is wrong: 2 children');
});
it('failed pricing keeps the kit and releases disabled controls', async () => {
  const v = thread.versions[0];
  render(
    <KitPanel
      version={v}
      versions={[v]}
      onVersion={noop}
      onRestore={noop}
      onSwap={async () => {}}
      onAdd={noop}
      onSelect={async () => {
        throw new Error('Price unavailable');
      }}
    />,
  );
  fireEvent.click(screen.getByRole('button', { name: 'Add anyway' }));
  await waitFor(() =>
    expect(screen.getByRole('alert').textContent).toContain(
      'Price unavailable',
    ),
  );
  expect(screen.getByText('Missing: anti-hunchback')).toBeTruthy();
  expect(
    (screen.getByRole('button', { name: 'Add anyway' }) as HTMLButtonElement)
      .disabled,
  ).toBe(false);
});
it('Fit sends selection, Undo restores it, and saved selection survives reload', async () => {
  const api = new MockKitApi(0);
  for await (const event of api.run('School budget 200k')) void event;
  const id = (await api.listThreads()).threads[0].id;
  const saved = await api.getThread(id);
  const over = basketOptionSchema.parse(overBudget);
  saved.versions[0].plan.budget = 200000;
  saved.versions[0].options = [over];
  const calls: KitSelection[] = [];
  api.getThread = async () => structuredClone(saved);
  api.price = async (_id, selection) => {
    calls.push(structuredClone(selection));
    const option = selection.dropped.length
      ? {
          ...over,
          status: 'ok' as const,
          lines: over.lines.filter((l) =>
            ['notebooks', 'pencils-pens'].includes(l.itemKey),
          ),
          grandTotal: 85000,
          itemsTotal: 60000,
          shippingTotal: 25000,
          discountTotal: 0,
          fit: [],
          overBy: undefined,
        }
      : over;
    saved.versions[0].selection = selection;
    saved.versions[0].options = [option];
    return { option };
  };
  render(<KitScreen api={api} id={id} />);
  fireEvent.click(
    await screen.findByRole('button', { name: /Keep notebooks and pens/ }),
  );
  await screen.findByRole('button', { name: 'Undo last basket edit' });
  expect(calls[0].dropped).toEqual(over.fit![0].removeItemKeys);
  fireEvent.click(
    screen.getByRole('button', { name: 'Undo last basket edit' }),
  );
  await waitFor(() => expect(calls).toHaveLength(2));
  expect(calls[1]).toEqual({ profile: 'balanced', picks: {}, dropped: [] });
  fireEvent.click(
    await screen.findByRole('button', { name: /Keep notebooks and pens/ }),
  );
  await waitFor(() => expect(calls).toHaveLength(3));
  cleanup();
  render(<KitScreen api={api} id={id} />);
  await screen.findByRole('tab', { name: /85.000₫/ });
  expect(screen.queryByText('Over budget by 635.000₫')).toBeNull();
});
it('all edit controls lock during pricing and the failed response leaves prior state intact', async () => {
  const api = new MockKitApi(0);
  for await (const e of api.run('School budget 1M')) void e;
  const id = (await api.listThreads()).threads[0].id;
  let reject: ((error: Error) => void) | undefined;
  api.price = () =>
    new Promise((_resolve, fail) => {
      reject = fail;
    });
  render(<KitScreen api={api} id={id} />);
  fireEvent.click(await screen.findByRole('button', { name: 'Add anyway' }));
  await waitFor(() => expect(reject).toBeTruthy());
  expect(
    (screen.getByLabelText('Message Kitly') as HTMLTextAreaElement).disabled,
  ).toBe(true);
  expect(
    (screen.getByRole('button', { name: 'Edit budget' }) as HTMLButtonElement)
      .disabled,
  ).toBe(true);
  reject!(new Error('Price temporarily unavailable'));
  await screen.findByText('Price temporarily unavailable');
  expect(screen.getByText('Missing: anti-hunchback')).toBeTruthy();
  expect(
    (screen.getByLabelText('Message Kitly') as HTMLTextAreaElement).disabled,
  ).toBe(false);
});
it('fixture replay refuses unrecorded edits and never returns unchanged prices as success', async () => {
  const api = new MockKitApi(0);
  for await (const event of api.run('School budget 1M')) void event;
  const id = (await api.listThreads()).threads[0].id;
  await expect(
    api.price(id, {
      profile: 'balanced',
      picks: { backpack: 'prod-minhan-backpack' },
      dropped: [],
    }),
  ).rejects.toThrow('recorded');
  await expect(
    api.price(id, {
      profile: 'balanced',
      picks: {},
      dropped: ['water-bottle'],
    }),
  ).rejects.toThrow('recorded');
  await expect(
    api.adjust(id, { type: 'remove_item', itemKey: 'water-bottle' }),
  ).rejects.toThrow('recorded');
  expect((await api.getThread(id)).versions).toHaveLength(1);
});
it('invalid fractional budget is rejected before calling the API', () => {
  let called = false;
  const version = thread.versions[0];
  render(
    <KitPanel
      version={version}
      versions={[version]}
      onVersion={noop}
      onRestore={noop}
      onSwap={async () => {}}
      onAdd={noop}
      onAdjust={async () => {
        called = true;
      }}
    />,
  );
  fireEvent.click(screen.getByRole('button', { name: 'Edit budget' }));
  fireEvent.change(screen.getByLabelText('Budget in VND'), {
    target: { value: '1.5' },
  });
  fireEvent.keyDown(screen.getByLabelText('Budget in VND'), { key: 'Enter' });
  expect(called).toBe(false);
  expect(screen.getByRole('alert').textContent).toContain('whole amount');
});
it('reloading a saved Premium edit shows that selected basket', async () => {
  const version = structuredClone(thread.versions[0]);
  version.selection = { profile: 'premium', picks: {}, dropped: [] };
  render(
    <KitPanel
      version={version}
      versions={[version]}
      onVersion={noop}
      onRestore={noop}
      onSwap={async () => {}}
      onAdd={noop}
    />,
  );
  await waitFor(() =>
    expect(
      screen
        .getByRole('tab', { name: /Premium/ })
        .getAttribute('aria-selected'),
    ).toBe('true'),
  );
});
it('B8 reload views each hydrated historical selection without writing it onto the latest version', async () => {
  const api = new MockKitApi(0);
  for await (const event of api.run('School budget 1M')) void event;
  const id = (await api.listThreads()).threads[0].id;
  const saved = await api.getThread(id);
  const latest = saved.versions[0];
  const balanced = latest.options.find((o) => o.profile === 'balanced')!;
  const gap = balanced.noMatch.find((g) => g.closest)!;
  const c = gap.closest!.candidate;
  latest.selection = {
    profile: 'balanced',
    picks: { [gap.itemKey]: c.product.id },
    dropped: [],
  };
  const priced = {
    ...balanced,
    noMatch: balanced.noMatch.filter((g) => g.itemKey !== gap.itemKey),
    lines: [
      ...balanced.lines,
      {
        itemKey: gap.itemKey,
        product: c.product,
        shop: c.shop,
        quantity: 1,
        lineTotal: 349000,
        reason: 'Closest match · missing anti-hunchback',
        alternatives: [],
      },
    ],
    grandTotal: 1184000,
  };
  const second = structuredClone(latest);
  second.version = 2;
  second.selection = { profile: 'balanced', picks: {}, dropped: [] };
  saved.versions.push(second);
  latest.options = latest.options.map((o) =>
    o.profile === priced.profile ? priced : o,
  );
  let sent: KitSelection | undefined;
  api.getThread = async () => structuredClone(saved);
  api.price = async (_id, selection) => {
    sent = selection;
    throw new Error('Reload must be read-only');
  };
  render(<KitScreen api={api} id={id} />);
  await screen.findByLabelText('Kit version');
  fireEvent.change(screen.getByLabelText('Kit version'), {
    target: { value: '1' },
  });
  await waitFor(() =>
    expect(
      within(screen.getByTestId('basket')).getByText(
        'Closest match · missing anti-hunchback',
      ),
    ).toBeTruthy(),
  );
  expect(sent).toBeUndefined();
  expect(screen.getByText(/Viewing an earlier version/)).toBeTruthy();
});
it('normalizes a backend removal explanation into the required system line', () => {
  const previous = structuredClone(thread.versions[0]);
  const removed = structuredClone(previous);
  removed.version = 2;
  removed.kind = 'adjust';
  removed.excludedKeys = ['water-bottle'];
  removed.plan.items = removed.plan.items.filter(
    (item) => item.key !== 'water-bottle',
  );
  removed.explanation = 'Removed Water bottle. New total 700.000₫.';
  render(<Conversation versions={[previous, removed]} onUndoRemove={noop} />);
  expect(screen.getByText(/^⚙ Removed: Water bottle/)).toBeTruthy();
});
