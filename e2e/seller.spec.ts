import { expect, test } from '@playwright/test';
test.skip(process.env.KITLY_E2E_MOCK !== '1', 'Requires fixture replay build');
test('seller previews, applies, reloads and undoes the listing fix', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/seller?shop=shop-minhan');
  await expect(
    page.getByRole('heading', { name: 'Seller Intelligence' }),
  ).toBeVisible();
  await expect(
    page.getByText('1 listing could match if its tags were fixed'),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Preview fix' }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await expect(page.getByText('Old keywords still match ✓')).toBeVisible();
  await page.getByRole('button', { name: 'Apply enrichment' }).click();
  await expect(page.getByText('Fixed', { exact: true })).toBeVisible();
  await page.reload();
  await expect(page.getByText('Fixed', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Undo', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Preview fix' })).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
});
