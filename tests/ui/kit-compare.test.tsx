import { afterEach, expect, it } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { threadResponseSchema } from '@/contract/schemas';
import threads from '@/contract/fixtures/threads.sample.json';
import { mergeOptions, compareToBalanced } from '@/lib/client/kit-compare';
import { KitPanel } from '@/components/kit/panel';
const version = threadResponseSchema.parse(threads[0]).versions[0];
const base = version.options.find((o) => o.profile === 'balanced')!;
afterEach(cleanup);
function options() {
  return (['saver', 'balanced', 'premium'] as const).map((profile) => ({
    ...structuredClone(base),
    profile,
  }));
}
function panel(opts = options()) {
  const v = { ...structuredClone(version), options: opts };
  return render(
    <KitPanel
      version={v}
      versions={[v]}
      onVersion={() => {}}
      onRestore={() => {}}
      onSwap={async () => {}}
      onAdd={() => {}}
    />,
  );
}
it('merges by total and product/quantity set, regardless of item keys, order, gaps or skipped metadata', () => {
  const opts = options();
  opts[0].lines.reverse();
  opts[0].lines[0].itemKey = 'renamed';
  opts[0].skipped = [];
  expect(mergeOptions(opts)).toHaveLength(1);
  expect(mergeOptions(opts)[0].label).toBe('Saver = Balanced = Premium');
  expect(mergeOptions(opts)[0].profile).toBe('balanced');
  opts[2].grandTotal++;
  expect(mergeOptions(opts).map((o) => o.label)).toEqual([
    'Saver = Balanced',
    'Premium',
  ]);
  opts[0].lines[0].quantity++;
  expect(mergeOptions(opts)).toHaveLength(3);
});
it('renders merged labels and defaults to Balanced with meaning and total', () => {
  panel();
  const tab = screen.getByRole('tab', { name: /Saver = Balanced = Premium/ });
  expect(tab.getAttribute('aria-selected')).toBe('true');
  expect(tab.textContent).toContain('best value');
});
it('hides tabs for all empty options while keeping the honest gap', () => {
  const opts = options().map((o) => ({ ...o, lines: [] }));
  panel(opts);
  expect(screen.queryByRole('tablist')).toBeNull();
  expect(screen.getByText(/Missing: anti-hunchback/)).toBeTruthy();
});
it('compares actual changed products and totals against Balanced and retains over-budget access', () => {
  const opts = options();
  const saver = opts[0];
  saver.grandTotal = base.grandTotal - 26000;
  saver.lines[0].product.id = 'cheaper-product';
  saver.lines[0].product.price -= 26000;
  const diff = compareToBalanced(saver, base, version.plan.items);
  expect(diff).toContain('−26.000₫');
  expect(diff).toContain('cheaper');
  opts[2].grandTotal += 380000;
  opts[2].status = 'over_budget';
  opts[2].overBy = 380000;
  panel(opts);
  expect(
    screen.getByRole('tab', { name: /Balanced/ }).getAttribute('aria-selected'),
  ).toBe('true');
  fireEvent.click(screen.getByRole('tab', { name: /Saver/ }));
  expect(screen.getByTestId('basket-difference').textContent).toBe(diff);
  const premium = screen.getByRole('tab', { name: /⚠ Premium/ });
  expect(premium.hasAttribute('disabled')).toBe(false);
  fireEvent.click(premium);
  expect(
    screen
      .getByRole('button', { name: /Add kit to cart \(over budget/ })
      .hasAttribute('disabled'),
  ).toBe(false);
});
it('keeps server repricing visible when a merged group uses another member profile', async () => {
  const opts = options();
  const v = {
    ...structuredClone(version),
    options: opts,
    selection: { profile: 'saver' as const, picks: {}, dropped: [] },
  };
  const priced = {
    ...structuredClone(base),
    profile: 'saver' as const,
    status: 'over_budget' as const,
    grandTotal: 2000000,
    overBy: 500000,
  };
  render(
    <KitPanel
      version={v}
      versions={[v]}
      onVersion={() => {}}
      onRestore={() => {}}
      onSwap={async () => priced}
      onAdd={() => {}}
    />,
  );
  fireEvent.click(screen.getAllByText('Swap', { exact: true })[0]);
  expect(await screen.findByText('Over budget by 500.000₫')).toBeTruthy();
  expect(
    screen
      .getByRole('tab', { name: /Saver = Balanced = Premium/ })
      .getAttribute('aria-selected'),
  ).toBe('true');
});
