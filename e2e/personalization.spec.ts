import { expect, test } from '@playwright/test';
test.skip(process.env.KITLY_E2E_MOCK !== '1', 'Requires fixture replay build');
test('personalised kit, answer reload, and Guest isolation', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/kit/new?q=School+budget+1M');
  await expect(page.getByText('💛 In your cart')).toBeVisible();
  await expect(page.getByText('Deliver to Cau Giay, Hanoi')).toBeVisible();
  await expect(
    page.getByRole('button', { name: 'Choose express delivery' }),
  ).toBeEnabled();
  await page
    .getByLabel('Message Kitly')
    .fill('Is the backpack really anti-hunchback?');
  await page.getByRole('button', { name: 'Send message' }).click();
  await expect(
    page.getByText(/The description mentions S-shaped straps/),
  ).toBeVisible();
  await expect(page.getByLabel('Kit version')).toContainText('Version 1 of 1');
  await page.reload();
  await expect(
    page.getByText(/The description mentions S-shaped straps/),
  ).toBeVisible();
  await page.getByRole('button', { name: /👤 Lan/ }).click();
  await page.getByRole('menuitem', { name: 'Guest' }).click();
  await expect(page.getByRole('button', { name: '👤 Guest' })).toBeVisible();
  await page.goto('/kit/new?q=School+budget+1M');
  await expect(page.getByLabel('Kit version')).toContainText('Version 1 of 1');
  await expect(page.getByText('💛 In your cart')).toHaveCount(0);
  await expect(page.getByText(/Deliver to/)).toHaveCount(0);
  await expect(page.getByText(/Your wallet voucher/)).toHaveCount(0);
  await page.setViewportSize({ width: 390, height: 844 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  await page.getByRole('button', { name: '👤 Guest' }).click();
  await page.getByRole('menuitem', { name: 'Lan' }).click();
});
