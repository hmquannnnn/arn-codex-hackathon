import { expect, test } from '@playwright/test';

test.skip(
  process.env.KITLY_E2E_LIVE !== '1',
  'Requires the seeded live DB/model build',
);
test.setTimeout(180000);

test('tiny budget shows minimum and Fit while cart stays available', async ({
  page,
}) => {
  await page.goto('/kit/new?q=' + encodeURIComponent('Grade 1, budget 200k'));
  await expect(page.getByLabel('Message Kitly')).toBeEnabled({
    timeout: 120000,
  });
  const warning = page.getByRole('alert').filter({ hasText: 'Over budget by' });
  await expect(warning).toBeVisible({ timeout: 120000 });
  await expect(warning).toContainText('Minimum cost:');
  await expect(warning.getByRole('button').first()).toBeEnabled();
  await expect(
    page.getByRole('button', { name: /Add kit to cart \(over budget/ }),
  ).toBeEnabled();
  await page.reload();
  await expect(warning).toBeVisible();
  await page
    .getByRole('button', { name: /Add kit to cart \(over budget/ })
    .click();
  await expect(page).toHaveURL(/\/cart$/);
});

test('express quick reply changes the deadline once without repeating express', async ({
  page,
}) => {
  await page.goto(
    '/kit/new?q=' +
      encodeURIComponent(
        'My kid starts Grade 1. Budget 1.5M VND. The backpack must be anti-hunchback, under 400k.',
      ),
  );
  await expect(page.getByLabel('Message Kitly')).toBeEnabled({
    timeout: 120000,
  });
  await expect(page.getByLabel('Kit version')).toContainText('Version 1 of 1', {
    timeout: 120000,
  });
  const replies = page.getByRole('button', {
    name: /express|hoả tốc|hỏa tốc/i,
  });
  if (!(await replies.count())) {
    await page
      .getByLabel('Message Kitly')
      .fill(
        'Can this kit arrive sooner? Please offer an express delivery quick reply.',
      );
    await page.getByRole('button', { name: 'Send message' }).click();
    await expect(
      replies.and(page.locator('button:enabled')).first(),
    ).toBeEnabled({ timeout: 120000 });
  }
  await expect(
    replies.and(page.locator('button:enabled')).first(),
  ).toBeEnabled();
  await replies.and(page.locator('button:enabled')).first().click();
  await expect(page.getByLabel('Kit version')).toContainText('Version 2 of 2', {
    timeout: 120000,
  });
  await expect(page.getByLabel('Message Kitly')).toBeEnabled({
    timeout: 120000,
  });
  await expect(
    page.getByRole('button', { name: 'Edit deadline' }),
  ).toContainText('By Sep 4');
  const id = new URL(page.url()).pathname.split('/').at(-1);
  const response = await page.request.get('/api/threads/' + id);
  const thread = await response.json();
  const version = thread.versions.at(-1);
  const balanced = version.options.find(
    (option: { profile: string }) => option.profile === 'balanced',
  );
  expect(balanced.grandTotal).toBeLessThanOrEqual(1500000);
  for (const line of balanced.lines)
    expect(line.product.shipDaysMax).toBeLessThanOrEqual(2);
  expect(
    balanced.noMatch.some(
      (gap: { closest?: { candidate: { product: { id: string } } } }) =>
        gap.closest?.candidate.product.id === 'prod-minhan-backpack',
    ),
  ).toBe(true);

  await expect(
    page.getByRole('button', { name: 'Edit deadline' }),
  ).not.toContainText('By Sep 5');
  await expect(
    page.getByRole('button', { name: /Add kit to cart/ }),
  ).toHaveText('Add kit to cart');
  await expect(
    page
      .getByRole('button', { name: /express|hoả tốc|hỏa tốc/i })
      .and(page.locator('button:enabled')),
  ).toHaveCount(0);
});

test('expensive alternative warns, keeps cart enabled and Fit restores the budget', async ({
  page,
}) => {
  await page.goto(
    '/kit/new?q=' +
      encodeURIComponent(
        'My kid starts Grade 1. Budget 1.5M VND. The backpack must be anti-hunchback, under 400k.',
      ),
  );
  await expect(page.getByLabel('Kit version')).toContainText('Version 1 of 1', {
    timeout: 120000,
  });
  await expect(page.getByLabel('Message Kitly')).toBeEnabled({
    timeout: 120000,
  });
  await page
    .getByLabel('Message Kitly')
    .fill('School gives the uniform, cut the budget to 1M.');
  await page.getByRole('button', { name: 'Send message' }).click();
  await expect(page.getByLabel('Kit version')).toContainText('Version 2 of 2', {
    timeout: 120000,
  });
  await expect(page.getByLabel('Message Kitly')).toBeEnabled({
    timeout: 120000,
  });
  const id = new URL(page.url()).pathname.split('/').at(-1);
  const response = await page.request.get('/api/threads/' + id);
  expect(response.ok()).toBeTruthy();
  const thread = await response.json();
  const version = thread.versions.at(-1);
  const balanced = version.options.find(
    (option: { profile: string }) => option.profile === 'balanced',
  );
  const alternatives = balanced.lines.flatMap(
    (line: {
      itemKey: string;
      product: { price: number };
      alternatives: { product: { id: string; title: string; price: number } }[];
    }) =>
      line.alternatives.map((alt) => ({
        ...alt,
        itemKey: line.itemKey,
        increase: alt.product.price - line.product.price,
      })),
  );
  alternatives.sort(
    (a: { increase: number }, b: { increase: number }) =>
      b.increase - a.increase,
  );
  expect(alternatives.length).toBeGreaterThan(0);
  const swapped = new Set<string>();
  let exceeded = false;
  for (const expensive of alternatives) {
    if (expensive.increase <= 0 || swapped.has(expensive.itemKey)) continue;
    swapped.add(expensive.itemKey);
    const row = page
      .getByTestId('basket')
      .locator('details')
      .filter({ hasText: expensive.product.title })
      .first();
    await row.locator('summary').click();
    const priced = page.waitForResponse(
      (response) =>
        response.url().endsWith('/api/kit/price') &&
        response.request().method() === 'POST',
    );
    await row
      .locator('div')
      .filter({
        has: page.getByText(expensive.product.title, { exact: false }),
      })
      .getByRole('button', { name: 'Swap', exact: true })
      .first()
      .click();
    const response = await priced;
    expect(response.ok()).toBeTruthy();
    const { option } = await response.json();
    if (option.status === 'over_budget') {
      exceeded = true;
      break;
    }
    await expect(page.getByLabel('Message Kitly')).toBeEnabled();
  }
  expect(exceeded).toBe(true);
  const warning = page.getByRole('alert').filter({ hasText: 'Over budget by' });
  await expect(warning).toBeVisible({ timeout: 30000 });
  await expect(
    page.getByRole('button', { name: /Add kit to cart \(over budget/ }),
  ).toBeEnabled();
  await warning.getByRole('button').first().click();
  await expect(warning).toHaveCount(0, { timeout: 30000 });
  await expect(
    page.getByRole('button', { name: 'Add kit to cart', exact: true }),
  ).toBeEnabled();
});
