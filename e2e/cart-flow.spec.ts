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
// Run against a local production server with KITLY_ADAPTER=memory; never assume fixture IDs in the live catalog.
test.skip(
  process.env.KITLY_E2E_CART !== '1',
  'Explicit local memory-adapter cart rehearsal',
);
test('cart-only entry, selected quantity checkout and saved leftovers', async ({
  page,
}) => {
  const saved = [0, 1].map((i) => ({
    product: products[i],
    shop: shops.find((s) => s.id === products[i].shopId),
    quantity: i === 0 ? 3 : 1,
  }));
  await page.goto('/');
  await page.evaluate((lines) => {
    localStorage.setItem('kitly-cart', JSON.stringify(lines));
    sessionStorage.setItem(
      'kitly-cart-selection',
      JSON.stringify([{ productId: lines[0].product.id, quantity: 1 }]),
    );
  }, saved);
  await page.goto('/cart');
  await expect(
    page.getByLabel(`Buy ${products[0].title}`, { exact: true }),
  ).toBeChecked();
  await expect(
    page.getByLabel(`Buy ${products[1].title}`, { exact: true }),
  ).not.toBeChecked();
  await expect(
    page.getByRole('button', { name: 'Checkout selected' }),
  ).toBeEnabled();
  await page.getByRole('link', { name: 'Build a kit from my cart' }).click();
  await expect(page).toHaveURL(/\/cart\/kit\/new$/);
  await expect(
    page.getByRole('heading', { name: 'Build from your cart' }),
  ).toBeVisible();
  await expect(page.getByLabel('Choose products from')).toHaveCount(0);
  await page.getByText('Saved products · 2').click();
  await page.getByLabel(`Keep ${products[0].title}`).check();
  await page.goto('/cart');
  await expect(
    page.getByRole('button', { name: 'Checkout selected' }),
  ).toBeEnabled();
  await page.getByRole('button', { name: 'Checkout selected' }).click();
  await expect(page).toHaveURL(/checkout\/confirmation/);
  await expect(page.getByText('You’re all set!')).toBeVisible();
  const remaining = await page.evaluate(() =>
    JSON.parse(localStorage.getItem('kitly-cart')!),
  );
  expect(remaining.map((line: { quantity: number }) => line.quantity)).toEqual([
    2, 1,
  ]);
});
test('an empty checkout selection stays empty after reload', async ({
  page,
}) => {
  await page.goto('/');
  await page.evaluate(
    ({ product, shop }) => {
      localStorage.setItem(
        'kitly-cart',
        JSON.stringify([{ product, shop, quantity: 1 }]),
      );
      sessionStorage.setItem('kitly-cart-selection', '[]');
    },
    {
      product: products[0],
      shop: shops.find((s) => s.id === products[0].shopId),
    },
  );
  await page.goto('/cart');
  await expect(
    page.getByLabel(`Buy ${products[0].title}`, { exact: true }),
  ).not.toBeChecked();
  await expect(
    page.getByRole('button', { name: 'Checkout selected' }),
  ).toBeDisabled();
  await page.reload();
  await expect(
    page.getByLabel(`Buy ${products[0].title}`, { exact: true }),
  ).not.toBeChecked();
});
test('real planner honors a cart keep, survives reload and confirms without duplicating saved quantities', async ({
  page,
}) => {
  test.skip(
    process.env.KITLY_E2E_CART_LLM !== '1',
    'Opt-in real-model cart kit',
  );
  test.setTimeout(180000);
  const ids = [
    'prod-kidzone-lite-backpack',
    'prod-minhan-notebooks',
    'prod-minhan-kids-desk-lamp',
    'prod-kidzone-notebooks',
  ];
  const saved = ids.map((id) => {
    const product = products.find((p) => p.id === id)!;
    return {
      product,
      shop: shops.find((s) => s.id === product.shopId),
      quantity: product.category === 'notebooks' ? 3 : 1,
    };
  });
  await page.goto('/');
  await page.evaluate((lines) => {
    localStorage.setItem('kitly-cart', JSON.stringify(lines));
  }, saved);
  await page.goto('/kit/new?source=cart_only');
  await expect(page).toHaveURL(/\/cart\/kit\/new$/);
  await expect(
    page.getByRole('heading', { name: 'Build from your cart' }),
  ).toBeVisible();
  await expect(page.getByLabel('Choose products from')).toHaveCount(0);
  await page
    .getByLabel('Message Kitly')
    .fill(
      'My kid starts Grade 1, budget 800k VND. Only use products from my cart. Keep the KidZone Lite backpack. We already have a desk lamp.',
    );
  await page.getByLabel('Message Kitly').press('Enter');
  await expect(page.getByTestId('basket')).toBeVisible({ timeout: 120000 });
  await expect(
    page.getByTestId('basket').getByText('KidZone Lite Backpack Grade 1–3'),
  ).toBeVisible();
  await expect(page.getByText('Kept by you', { exact: false })).toBeVisible();
  await expect(
    page.getByRole('button', { name: 'Use selected items', exact: true }),
  ).toBeEnabled({ timeout: 60000 });
  await expect(
    page.getByText('Missing from this cart', { exact: false }),
  ).toBeVisible();
  const chosenNotebook = page
    .getByTestId('basket')
    .locator('a[href*="notebooks"]')
    .first();
  const originalNotebook = await chosenNotebook.textContent();
  await page.getByTestId('basket').locator('summary').first().click();
  await page
    .getByTestId('basket')
    .getByRole('button', { name: 'Swap', exact: true })
    .first()
    .click();
  await expect(chosenNotebook).not.toHaveText(originalNotebook!);
  await expect(
    page.getByRole('button', { name: 'Use selected items', exact: true }),
  ).toBeEnabled();
  await page.getByRole('button', { name: 'Edit budget' }).click();
  await page.getByLabel('Budget in VND').fill('750000');
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(page.getByLabel('Kit version')).toHaveValue('2');
  const cartThreadURL = page.url();
  expect(cartThreadURL).toMatch(/\/cart\/kit\/t\//);
  await page.goto(cartThreadURL.replace('/cart/kit/t/', '/kit/t/'));
  await expect(page).toHaveURL(cartThreadURL);
  await page.reload();
  await expect(page.getByText('Kept by you', { exact: false })).toBeVisible({
    timeout: 30000,
  });
  await expect(
    page.getByRole('heading', { name: /Items to buy/ }),
  ).toBeVisible();
  await expect(
    page.getByRole('region', { name: 'Saved for later' }),
  ).toBeVisible();
  const historyLink = page
    .getByRole('complementary', { name: 'Kit history' })
    .locator('a[href^="/cart/kit/t/"]')
    .first();
  await expect(historyLink).toHaveAttribute(
    'href',
    new URL(cartThreadURL).pathname,
  );
  await historyLink.click();
  await expect(page).toHaveURL(cartThreadURL);
  await expect(
    page.getByRole('button', { name: 'Use selected items', exact: true }),
  ).toBeEnabled();
  // Simulate a change from another tab after this kit was built.
  await page.evaluate(() => {
    const cart = JSON.parse(localStorage.getItem('kitly-cart')!);
    localStorage.setItem(
      'kitly-cart',
      JSON.stringify(
        cart.filter(
          (line: { product: { id: string } }) =>
            line.product.id !== 'prod-kidzone-lite-backpack',
        ),
      ),
    );
  });
  await page
    .getByRole('button', { name: 'Use selected items', exact: true })
    .click();
  await expect(
    page.getByRole('alert').filter({ hasText: 'Your cart has changed' }),
  ).toBeVisible();
  await expect(page).toHaveURL(cartThreadURL);
  await page.evaluate(
    (lines) => localStorage.setItem('kitly-cart', JSON.stringify(lines)),
    saved,
  );
  await page
    .getByRole('button', { name: 'Use selected items', exact: true })
    .click();
  await expect(page).toHaveURL(/\/cart$/);
  await expect(
    page
      .getByRole('status')
      .filter({ hasText: /Selected .* for this purchase/ }),
  ).toBeVisible();
  const actual = await page.evaluate(() =>
    JSON.parse(localStorage.getItem('kitly-cart')!),
  );
  expect(actual.map((l: { quantity: number }) => l.quantity)).toEqual([
    1, 3, 1, 3,
  ]);
  await expect(
    page.getByLabel(`Buy ${saved[2].product.title}`, { exact: true }),
  ).not.toBeChecked();
  await page.getByRole('button', { name: 'Checkout selected' }).click();
  await expect(page).toHaveURL(/checkout\/confirmation/);
  const leftovers = await page.evaluate(() =>
    JSON.parse(localStorage.getItem('kitly-cart')!),
  );
  expect(
    leftovers.find(
      (l: { product: { id: string } }) =>
        l.product.id === 'prod-minhan-kids-desk-lamp',
    ).quantity,
  ).toBe(1);
  expect(
    leftovers
      .filter(
        (l: { product: { category: string } }) =>
          l.product.category === 'notebooks',
      )
      .map((l: { quantity: number }) => l.quantity)
      .sort(),
  ).toEqual([2, 3]);
});
