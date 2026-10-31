import { expect, test } from '@playwright/test';
test.skip(
  process.env.KITLY_E2E_MOCK !== '1',
  'Run against a build with NEXT_PUBLIC_KITLY_MOCK=1',
);
test('new kit streams into URL, refines, reloads and restores a version', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/kit/new?q=My+kid+starts+Grade+1.+Budget+1.5M');
  await expect(page).toHaveURL(/\/kit\/t\//);
  await expect(page.getByLabel('Kit version')).toContainText('Version 1 of 1');
  await expect(page.getByLabel('Message Kitly')).toBeEnabled();
  await expect(page.getByRole('tab', { name: /Balanced/ })).toHaveAttribute(
    'aria-selected',
    'true',
  );
  const gap = page.getByTestId('no-match');
  await expect(gap).toContainText('Missing: anti-hunchback');
  const bounds = await gap.boundingBox();
  expect(bounds && bounds.y + bounds.height < 900).toBeTruthy();
  await expect(page.getByRole('link', { name: 'Seller Centre' })).toHaveCount(
    0,
  );
  await page
    .getByLabel('Message Kitly')
    .fill('School gives uniforms, cut budget to 1M.');
  await page.getByRole('button', { name: 'Send message' }).click();
  await expect(page.getByLabel('Kit version')).toContainText('Version 2 of 2');
  await expect(page.getByLabel('Message Kitly')).toBeEnabled();
  await page.reload();
  await expect(page.getByTestId('user-turn')).toHaveCount(2);
  await page.getByLabel('Kit version').selectOption('1');
  await expect(
    page.getByText('Viewing an earlier version', { exact: false }),
  ).toBeVisible();
  await expect(
    page.getByRole('button', { name: 'Add kit to cart' }),
  ).toBeDisabled();
  await page.getByRole('button', { name: 'Restore this version' }).click();
  await expect(page.getByLabel('Kit version')).toContainText('Version 3 of 3');
  await page.getByRole('button', { name: 'Add kit to cart' }).click();
  await expect(page).toHaveURL(/\/cart$/);
  await expect(
    page.getByRole('button', { name: 'Checkout', exact: true }),
  ).toBeVisible();
});
test('mobile budget clarification and history drawer survive reload', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/kit/new');
  await page.getByLabel('Message Kitly').fill('School supplies');
  await page.getByRole('button', { name: 'Send message' }).click();
  await expect(page.getByText("What's your budget?")).toBeVisible();
  await expect(page.getByLabel('Message Kitly')).toBeEnabled();
  await page.getByRole('button', { name: 'Kit', exact: true }).click();
  await expect(page.getByText('Waiting for your budget')).toBeVisible();
  await page.getByRole('button', { name: 'Chat', exact: true }).click();
  await page.getByRole('button', { name: '1.000.000₫', exact: true }).click();
  await page.getByRole('button', { name: 'Kit', exact: true }).click();
  await expect(page.getByRole('tab', { name: /Balanced/ })).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  await page.getByRole('button', { name: 'Toggle history' }).click();
  await expect(
    page.getByRole('link', { name: 'School supplies' }),
  ).toBeVisible();
  await page
    .getByRole('button', { name: 'Close history', exact: true })
    .click();
  await page.reload();
  await page.getByRole('button', { name: 'Kit', exact: true }).click();
  await expect(page.getByLabel('Kit version')).toContainText('Version 2 of 2');
});
test('kit entry opens newest history, and missing thread is friendly', async ({
  page,
}) => {
  await page.goto('/kit');
  await expect(page).toHaveURL(/\/kit\/new$/);
  await page.getByLabel('Message Kitly').fill('School budget 1M');
  await page.getByRole('button', { name: 'Send message' }).click();
  await expect(page).toHaveURL(/\/kit\/t\//);
  await expect(page.getByLabel('Message Kitly')).toBeEnabled();
  const saved = page.url();
  await page.goto('/kit');
  await expect(page).toHaveURL(saved);
  await page.goto('/kit/t/missing');
  await expect(
    page.getByText('Kit not found. It may belong to another browser.'),
  ).toBeVisible();
});
