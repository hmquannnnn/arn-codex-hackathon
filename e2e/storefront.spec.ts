import { expect, test } from '@playwright/test';
test('store search, product, persistent cart and checkout at mobile width', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await expect(
    page.getByRole('heading', { name: 'Life has plans.' }),
  ).toBeVisible();
  await expect(
    page.getByRole('heading', { name: 'Back to school', exact: true }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  await page
    .getByRole('textbox', { name: 'Search products' })
    .fill('Minh An Kids Backpack');
  await page.getByRole('button', { name: 'Search', exact: true }).click();
  await page
    .getByRole('heading', {
      name: 'Minh An Kids Backpack New Model 2026',
      exact: true,
    })
    .click();
  await expect(page.getByText('Arrives by Sep 4, 2026')).toBeVisible();
  await page.getByRole('button', { name: 'Add to cart', exact: true }).click();
  await page.getByRole('link', { name: 'View cart' }).click();
  await expect(page).toHaveURL(/\/cart$/);
  await expect(page.getByRole('heading', { name: 'Your cart' })).toBeVisible();
  await page.reload();
  await expect(page.getByText('349.000₫').first()).toBeVisible();
  await page
    .getByRole('button', {
      name: 'Increase Minh An Kids Backpack New Model 2026',
    })
    .click();
  await expect(page.getByText('698.000₫')).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  await page.getByRole('button', { name: 'Checkout', exact: true }).click();
  await expect(
    page.getByRole('heading', { name: 'You’re all set!' }),
  ).toBeVisible();
  await page.reload();
  await expect(
    page.getByRole('heading', { name: 'You’re all set!' }),
  ).toBeVisible();
});
test('category browse and describe need navigation', async ({ page }) => {
  await page.goto('/categories/school-backpack');
  await expect(
    page.getByRole('heading', { name: 'School backpack', exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole('heading', {
      name: 'Minh An Kids Backpack New Model 2026',
      exact: true,
    }),
  ).toBeVisible();
  await page
    .getByRole('button', { name: 'Describe your need', exact: true })
    .click();
  await page
    .getByRole('textbox', { name: 'Describe your need' })
    .fill('School budget 1M');
  await page.getByRole('button', { name: 'Search', exact: true }).click();
  await expect(page).toHaveURL(/\/kit\/new\?q=School\+budget\+1M/);
});
