import { expect, test } from '@playwright/test';
import { readFileSync } from 'node:fs';
import type { Product, Shop } from '../src/contract/types';
const products: Product[] = JSON.parse(
  readFileSync(
    new URL('../src/contract/fixtures/products.json', import.meta.url),
    'utf8',
  ),
);
const shops: Shop[] = JSON.parse(
  readFileSync(
    new URL('../src/contract/fixtures/shops.json', import.meta.url),
    'utf8',
  ),
);
test.skip(process.env.KITLY_E2E_CART !== '1', 'Local memory-adapter rehearsal');
const saved = (ids: string[]) =>
  ids.map((id) => {
    const product = products.find((p) => p.id === id)!;
    return {
      product,
      shop: shops.find((s) => s.id === product.shopId)!,
      quantity: product.category === 'notebooks' ? 3 : 1,
    };
  });
test('dedicated cart entry and cancel preserve saved products and purchase selection', async ({
  page,
}) => {
  const lines = saved(['prod-kidzone-lite-backpack', 'prod-minhan-notebooks']);
  await page.goto('/');
  await page.evaluate((lines) => {
    localStorage.setItem('kitly-cart', JSON.stringify(lines));
    sessionStorage.setItem('kitly-cart-selection', '[]');
  }, lines);
  await page.goto('/cart');
  await page.getByRole('link', { name: 'Build a kit from my cart' }).click();
  await expect(page).toHaveURL(/\/cart\/kit\/new$/);
  await expect(
    page.getByRole('heading', { name: 'Build from your cart' }),
  ).toBeVisible();
  await expect(page.getByLabel('Choose products from')).toHaveCount(0);
  await expect(
    page.getByRole('button', { name: 'Newborn essentials, budget 2M VND.' }),
  ).toHaveCount(0);
  await page.getByRole('link', { name: 'Back to cart', exact: true }).click();
  await expect(page).toHaveURL(/\/cart$/);
  expect(
    await page.evaluate(() => JSON.parse(localStorage.getItem('kitly-cart')!)),
  ).toEqual(lines);
  expect(
    await page.evaluate(() =>
      JSON.parse(sessionStorage.getItem('kitly-cart-selection')!),
    ),
  ).toEqual([]);
});
test('source chooser hands off to fixed cart flow and empty cart cannot submit', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/kit/new');
  await page.getByLabel('Choose products from').selectOption('cart_only');
  await expect(page).toHaveURL(/\/cart\/kit\/new$/);
  await expect(page.getByText(/Your cart is empty/)).toBeVisible();
  await expect(
    page.getByRole('button', { name: 'Send message' }),
  ).toBeDisabled();
  await expect(page.getByLabel('Choose products from')).toHaveCount(0);
});
test('catalog discovery still adds missing products while preserving saved quantities', async ({
  page,
}) => {
  test.skip(process.env.KITLY_E2E_CART_LLM !== '1', 'Real model opt-in');
  test.setTimeout(150000);
  const lines = saved(['prod-minhan-notebooks', 'prod-minhan-kids-desk-lamp']);
  await page.goto('/');
  await page.evaluate(
    (lines) => localStorage.setItem('kitly-cart', JSON.stringify(lines)),
    lines,
  );
  await page.goto('/kit/new');
  await page
    .getByLabel('Message Kitly')
    .fill(
      'My kid starts Grade 1, budget 1.5M VND. School gives the uniform. We already have a desk lamp.',
    );
  await page.getByLabel('Message Kitly').press('Enter');
  const add = page.getByRole('button', {
    name: 'Add kit to cart',
    exact: true,
  });
  await expect(add).toBeEnabled({ timeout: 120000 });
  await expect(page).toHaveURL(/\/kit\/t\//);
  await expect(
    page.getByRole('button', { name: 'Use selected items' }),
  ).toHaveCount(0);
  expect(
    await page.evaluate(() => JSON.parse(localStorage.getItem('kitly-cart')!)),
  ).toEqual(lines);
  await add.click();
  await expect(page).toHaveURL(/\/cart$/);
  const result = await page.evaluate(() =>
    JSON.parse(localStorage.getItem('kitly-cart')!),
  );
  expect(result.length).toBeGreaterThan(lines.length);
  expect(
    result.find(
      (l: { product: { id: string } }) =>
        l.product.id === 'prod-minhan-notebooks',
    ).quantity,
  ).toBe(3);
  expect(
    result.find(
      (l: { product: { id: string } }) =>
        l.product.id === 'prod-minhan-kids-desk-lamp',
    ).quantity,
  ).toBe(1);
});
