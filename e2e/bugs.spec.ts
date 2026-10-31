import { expect, test, type Page } from '@playwright/test';
import type { ThreadResponse } from '../src/contract/types';

test.skip(
  process.env.KITLY_E2E_LIVE !== '1',
  'Requires real seeded app and model',
);
test.describe.configure({ timeout: 180000 });
test.use({
  viewport: { width: 1440, height: 650 },
  screenshot: 'only-on-failure',
});
const hero =
  'My kid starts Grade 1. Budget 1.5M VND. The backpack must be anti-hunchback, under 400k.';
async function ready(page: Page, version: number) {
  await expect(page.getByLabel('Kit version')).toHaveValue(String(version), {
    timeout: 120000,
  });
  await expect(page.getByLabel('Message Kitly')).toBeEnabled({
    timeout: 120000,
  });
}
async function thread(page: Page): Promise<ThreadResponse> {
  const id = new URL(page.url()).pathname.split('/').at(-1)!;
  const response = await page.request.get('/api/threads/' + id);
  expect(response.ok()).toBe(true);
  return response.json();
}

test('F5 persona switch blocks immediate submission until the Guest cookie is confirmed', async ({
  page,
}) => {
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  let started = 0;
  page.on('request', (request) => {
    if (
      request.method() === 'POST' &&
      new URL(request.url()).pathname === '/api/kit'
    )
      started++;
  });
  await page.goto('/kit/new');
  await page.getByLabel('Message Kitly').fill(hero);
  await page.route('**/api/persona', async (route) => {
    if (route.request().method() === 'POST') await gate;
    await route.continue();
  });
  try {
    await page.getByRole('button', { name: /👤 Lan/ }).click();
    await page.getByRole('menuitem', { name: 'Guest' }).click();
    await expect(
      page.getByRole('button', { name: 'Send message' }),
    ).toBeDisabled();
    await page
      .locator('form')
      .evaluate((form) => (form as HTMLFormElement).requestSubmit());
    expect(started).toBe(0);
    release();
    await expect(
      page.getByRole('button', { name: '👤 Guest', exact: true }),
    ).toBeVisible();
    await page.getByRole('button', { name: 'Send message' }).click();
    await ready(page, 1);
    expect((await thread(page)).thread.persona).toBe('guest');
    await expect(page.getByText('💛 In your cart')).toHaveCount(0);
    await expect(page.getByText(/Deliver to|Your wallet voucher/)).toHaveCount(
      0,
    );
  } finally {
    release();
    await page.unroute('**/api/persona');
    await page.request.post('/api/persona', { data: { id: 'lan' } });
  }
});

test('B8/F1 saved Add anyway survives edits, reload and historical restore; chat follows the latest turn', async ({
  page,
}) => {
  await page.goto('/kit/new');
  await page.getByLabel('Message Kitly').fill(hero);
  await page.getByRole('button', { name: 'Send message' }).click();
  await ready(page, 1);
  await page
    .getByRole('button', { name: 'Add anyway', exact: true })
    .first()
    .click();
  await expect(
    page.getByRole('button', { name: 'Undo last basket edit' }),
  ).toBeEnabled();
  const selected = (await thread(page)).versions[0];
  expect(Object.keys(selected.selection?.picks ?? {}).length).toBeGreaterThan(
    0,
  );
  const productId = Object.values(selected.selection!.picks)[0];
  const selectedKey = Object.keys(selected.selection!.picks)[0];
  const basket = selected.options.find(
    (o) => o.profile === selected.selection!.profile,
  )!;
  const removable = basket.lines.find((line) => line.itemKey !== selectedKey)!;
  await page
    .getByRole('button', {
      name: `Remove ${removable.product.title}`,
      exact: true,
    })
    .click();
  await ready(page, 2);
  let saved = await thread(page);
  expect(saved.versions[1].selection?.picks[selectedKey]).toBe(productId);
  expect(
    saved.versions[1].options
      .find((o) => o.profile === selected.selection!.profile)!
      .lines.some((l) => l.product.id === productId),
  ).toBe(true);
  await page.reload();
  await ready(page, 2);
  const scroll = page
    .getByRole('region', { name: 'Chat' })
    .locator('> div')
    .first();
  await expect
    .poll(() =>
      scroll.evaluate(
        (node) => node.scrollHeight - node.clientHeight - node.scrollTop,
      ),
    )
    .toBeLessThanOrEqual(2);
  await page.getByLabel('Kit version').selectOption('1');
  await expect(page.getByText(/Viewing an earlier version/)).toBeVisible();
  await expect(
    page.getByTestId('basket').getByRole('link', {
      name: 'Minh An Kids Backpack New Model 2026',
      exact: true,
    }),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Restore this version' }).click();
  await ready(page, 3);
  saved = await thread(page);
  expect(saved.versions[2].selection).toEqual(selected.selection);
  expect(
    saved.versions[2].options.find(
      (o) => o.profile === selected.selection!.profile,
    )!.grandTotal,
  ).toBe(basket.grandTotal);
  await expect
    .poll(() =>
      scroll.evaluate(
        (node) => node.scrollHeight - node.clientHeight - node.scrollTop,
      ),
    )
    .toBeLessThanOrEqual(2);
});

test('F3 follow-up swap prices the visible Premium profile through the real API', async ({
  page,
}) => {
  await page.goto('/kit/new');
  await page.getByLabel('Message Kitly').fill(hero);
  await page.getByRole('button', { name: 'Send message' }).click();
  await ready(page, 1);
  let saved = await thread(page);
  let follow = saved.versions.at(-1)!.followUp;
  let action = follow?.suggestions.find((s) => s.action?.type === 'swap');
  for (let attempt = 0; !action && attempt < 2; attempt++) {
    const answer = page.waitForResponse(
      (r) => new URL(r.url()).pathname === '/api/kit/refine',
    );
    await page
      .getByLabel('Message Kitly')
      .fill('Which other lunch box can I choose?');
    await page.getByRole('button', { name: 'Send message' }).click();
    await (await answer).finished();
    await ready(page, 1);
    saved = await thread(page);
    follow = saved.messages.at(-1)?.followUp ?? null;
    action = follow?.suggestions.find((s) => s.action?.type === 'swap');
  }
  expect(
    action,
    'Model should offer a grounded swap after an explicit alternatives question',
  ).toBeDefined();
  await page.getByRole('tab', { name: /Premium/ }).click();
  const pricing = page.waitForRequest(
    (r) => new URL(r.url()).pathname === '/api/kit/price',
  );
  await page
    .getByRole('button', { name: action!.text, exact: true })
    .last()
    .click();
  const request = await pricing;
  expect(request.postDataJSON().selection.profile).toBe('premium');
  await expect(
    page.getByRole('button', { name: 'Undo last basket edit' }),
  ).toBeEnabled();
});
