import { afterEach, expect, it } from 'vitest';
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import { MockSellerApi } from '@/lib/client/seller-api';
import { LiveStrip, GapCard } from '@/components/seller/gaps';
import { PreviewDrawer } from '@/components/seller/preview';
import { SellerScreen } from '@/components/seller/screen';
import { NotifyButton } from '@/components/kit/notify-button';
afterEach(() => {
  cleanup();
  localStorage.clear();
});
it('live strip is newest first and has an honest empty state', () => {
  const recent = [
    {
      needLabel: 'Old',
      category: null,
      tags: [],
      event: 'other' as const,
      createdAt: '2026-09-02T08:00:00Z',
    },
    {
      needLabel: 'New',
      category: 'school-backpack',
      tags: [],
      event: 'back_to_school' as const,
      createdAt: '2026-09-02T08:01:00Z',
    },
  ];
  render(<LiveStrip recent={recent} />);
  expect(
    screen.getAllByTestId('recent-need').map((n) => n.textContent),
  ).toEqual([expect.stringContaining('New'), expect.stringContaining('Old')]);
  expect(screen.getByText('Not in catalog')).toBeTruthy();
  cleanup();
  render(<LiveStrip recent={[]} />);
  expect(screen.getByText('No live searches yet — try Kitly')).toBeTruthy();
});
it('preview shows added/kept changes and original keyword checks', async () => {
  const api = new MockSellerApi();
  const preview = await api.preview(
    'prod-minhan-backpack',
    'school-backpack|anti-hunchback',
  );
  render(
    <PreviewDrawer
      preview={preview}
      busy={false}
      onClose={() => {}}
      onApply={() => {}}
    />,
  );
  expect(screen.getByText('Added tags')).toBeTruthy();
  expect(screen.getByText('Kept tags')).toBeTruthy();
  expect(screen.getByText('Old keywords still match ✓')).toBeTruthy();
  expect(screen.getByText('anti-hunchback')).toBeTruthy();
  expect(screen.getByText(/spine straight/)).toBeTruthy();
});
it('applied fix and listing supply wording come from API data on first render', async () => {
  const api = new MockSellerApi();
  const { gaps } = await api.insights('shop-minhan');
  const gap = {
    ...gaps[0],
    appliedFix: {
      productId: 'prod-minhan-backpack',
      title: 'Fixed backpack',
      appliedAt: '2026-09-02T08:00:00Z',
    },
  };
  render(
    <GapCard gap={gap} busy={false} onPreview={() => {}} onUndo={() => {}} />,
  );
  expect(screen.getByText('Fixed')).toBeTruthy();
  expect(screen.getByRole('button', { name: 'Undo' })).toBeTruthy();
  expect(
    screen.getByText('1 listing could match if its tags were fixed'),
  ).toBeTruthy();
});
it('fixture preview/apply/reload/undo is durable and restores unfixed state', async () => {
  const api = new MockSellerApi();
  const proposal = await api.preview(
    'prod-minhan-backpack',
    'school-backpack|anti-hunchback',
  );
  await api.apply(proposal.proposalId);
  const reloaded = new MockSellerApi();
  expect(
    (await reloaded.insights('shop-minhan')).gaps[0].appliedFix,
  ).not.toBeNull();
  await reloaded.undo('prod-minhan-backpack');
  expect((await api.insights('shop-minhan')).gaps[0].appliedFix).toBeNull();
});
it('seller screen preserves server gap order and applies via preview then refreshes', async () => {
  const api = new MockSellerApi();
  render(<SellerScreen api={api} initialShop="shop-minhan" />);
  fireEvent.click(await screen.findByRole('button', { name: 'Preview fix' }));
  await screen.findByRole('dialog');
  fireEvent.click(screen.getByRole('button', { name: 'Apply enrichment' }));
  await screen.findByText('Fixed');
  expect(screen.queryByRole('dialog')).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: 'Undo' }));
  await screen.findByRole('button', { name: 'Preview fix' });
  expect(screen.getAllByTestId('gap-card')[0].textContent).toContain(
    'Anti-hunchback backpack',
  );
});
it('Notify me handles request state and retry without changing counts on failure', async () => {
  let calls = 0;
  render(
    <NotifyButton
      gapKey="kids-raincoat|backpack-cover"
      subscribe={async () => {
        if (++calls === 1) throw new Error('Try again');
        return { watchers: 1 };
      }}
    />,
  );
  fireEvent.click(screen.getByRole('button', { name: 'Notify me' }));
  await screen.findByText('Try again');
  fireEvent.click(screen.getByRole('button', { name: 'Notify me' }));
  await waitFor(() =>
    expect(
      screen.getByRole('button', { name: 'You’re on the list' }),
    ).toBeTruthy(),
  );
});
it('offers a direct Back to buyer route from Seller Centre', async () => {
  render(<SellerScreen api={new MockSellerApi()} initialShop="shop-minhan" />);
  expect(
    screen.getByRole('link', { name: 'Back to buyer' }).getAttribute('href'),
  ).toBe('/kit');
  await screen.findByRole('button', { name: 'Preview fix' });
});
