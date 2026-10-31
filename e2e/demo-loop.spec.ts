import { expect, test, type Page } from '@playwright/test';
import type {
  EnrichmentPreviewResponse,
  InsightsResponse,
  ThreadResponse,
} from '../src/contract/types';
const live = process.env.KITLY_E2E_MOCK !== '1';
test.skip(!live, 'Fixture replay builds use the separate mock suites');
test.describe.configure({ retries: 1, timeout: 300000 });
test.use({
  screenshot: 'only-on-failure',
  viewport: { width: 1440, height: 900 },
});
const hero =
  'My kid starts Grade 1. Budget 1.5M VND. The backpack must be anti-hunchback, under 400k.';
const money = (n: number) => new Intl.NumberFormat('vi-VN').format(n) + '₫';
async function ready(page: Page, n: number) {
  await expect(page.getByLabel('Kit version')).toContainText(
    `Version ${n} of ${n}`,
    { timeout: 120000 },
  );
  await expect(page.getByLabel('Message Kitly')).toBeEnabled({
    timeout: 120000,
  });
}
async function thread(page: Page): Promise<ThreadResponse> {
  const id = new URL(page.url()).pathname.split('/').at(-1);
  const response = await page.request.get('/api/threads/' + id);
  expect(response.ok()).toBeTruthy();
  return response.json();
}
async function insights(page: Page): Promise<InsightsResponse> {
  const response = await page.request.get(
    '/api/seller/insights?shopId=shop-minhan',
  );
  expect(response.ok()).toBeTruthy();
  return response.json();
}
async function say(page: Page, text: string) {
  await page.getByLabel('Message Kitly').fill(text);
  await page.getByRole('button', { name: 'Send message' }).click();
}
const backpackGap = (data: InsightsResponse) =>
  data.gaps.find(
    (g) =>
      g.category === 'school-backpack' && g.tags.includes('anti-hunchback'),
  )!;

test('DEMO beats 1–4: buyer intent, durable conversation, seller fix, exact match and Undo', async ({
  page,
  browser,
}, testInfo) => {
  let applied = false;
  let beforeProduct: unknown;
  try {
    const productResponse = await page.request.get(
      '/api/products/prod-minhan-backpack',
    );
    expect(productResponse.ok()).toBeTruthy();
    beforeProduct = (await productResponse.json()).product;
    const initial = backpackGap(await insights(page));
    expect(initial).toBeDefined();
    expect(initial.appliedFix).toBeFalsy();
    const baseline = initial.thisWeek;
    await page.goto('/');
    await page
      .getByRole('button', { name: 'Describe your need', exact: true })
      .click();
    const search = page.getByRole('textbox').first();
    await search.fill(hero);
    const stream = page.waitForResponse(
      (response) =>
        response.url().endsWith('/api/kit') &&
        response.request().method() === 'POST',
    );
    const started = Date.now();
    await search.press('Enter');
    await expect(page.getByText('Understanding', { exact: true })).toBeVisible({
      timeout: 10000,
    });
    await expect(
      page.getByTestId('basket').getByRole('link').first(),
    ).toBeVisible({ timeout: 20000 });
    const latency = Date.now() - started;
    console.log(
      `Hero first basket visible: ${latency}ms (target <=10000ms, required <=20000ms)`,
    );
    await testInfo.attach('hero-latency', {
      body: JSON.stringify({ latencyMs: latency }),
      contentType: 'application/json',
    });
    expect(latency).toBeLessThanOrEqual(20000);
    await expect(page).toHaveURL(/\/kit\/t\//);
    await ready(page, 1);
    const wire = await (await stream).text();
    for (const step of ['understand', 'plan', 'search', 'optimize', 'explain'])
      expect(wire).toContain(`"id":"${step}","status":"done"`);
    expect(wire).toMatch(/Compared \d+ products from \d+ shops/);
    const saved = page.url();
    await expect(
      page.getByRole('link', { name: /My kid starts Grade 1/ }),
    ).toBeVisible();
    const v1 = (await thread(page)).versions[0];
    expect(v1.plan.items.length).toBeGreaterThanOrEqual(8);
    await expect(
      page.getByRole('region', { name: 'Chat', exact: true }),
    ).toContainText(/Planned .*items.*compared products/);
    await expect(
      page.getByRole('button', { name: 'Edit budget', exact: true }),
    ).toContainText('1.500.000₫');
    await expect(
      page.getByRole('button', { name: 'Edit deadline', exact: true }),
    ).toContainText('By Sep 5');
    await expect(page.getByText('Deliver to Cau Giay, Hanoi')).toBeVisible();
    await expect(
      page.getByRole('button', {
        name: 'Edit assumption: By Sep 5 (school opening)',
        exact: true,
      }),
    ).toBeVisible();
    for (const profile of ['Saver', 'Balanced', 'Premium'])
      await expect(
        page.getByRole('tab', { name: new RegExp(profile) }),
      ).toBeVisible();
    await expect(page.getByRole('tab', { name: /Balanced/ })).toHaveAttribute(
      'aria-selected',
      'true',
    );
    for (const option of v1.options) {
      expect(option.grandTotal).toBeLessThanOrEqual(1500000);
      expect(
        option.lines.every((l) => l.shop.name !== 'Bago Bags'),
      ).toBeTruthy();
      await expect(
        page.getByRole('tab', { name: new RegExp(option.profile, 'i') }),
      ).toContainText(money(option.grandTotal));
    }
    expect(
      v1.options.find((o) => o.profile === 'saver')!.grandTotal,
    ).toBeLessThan(v1.options.find((o) => o.profile === 'premium')!.grandTotal);
    await expect(
      page.getByText(/Your wallet voucher Back-to-school 10%/),
    ).toBeVisible();
    const shopSaving = v1.options
      .find((o) => o.profile === 'balanced')!
      .savings.find((saving) => !saving.wallet);
    expect(shopSaving).toBeDefined();
    await expect(
      page.getByText(shopSaving!.label, { exact: true }).first(),
    ).toBeVisible();
    await expect(page.getByTestId('no-match')).toContainText(
      'Minh An Kids Backpack New Model 2026',
    );
    await expect(page.getByTestId('no-match')).toContainText('349.000₫');
    await expect(page.getByTestId('no-match')).toContainText(
      'Missing: anti-hunchback',
    );
    await expect(
      page.getByRole('button', { name: 'Add anyway', exact: true }),
    ).toBeVisible();
    const bounds = await page.getByTestId('no-match').boundingBox();
    expect(bounds && bounds.y + bounds.height < 900).toBeTruthy();
    await expect(
      page.getByText('💛 In your cart', { exact: true }),
    ).toBeVisible();
    await expect(page.getByTestId('no-match')).toContainText('440.000₫');
    await expect(page.getByTestId('no-match')).toContainText(
      'over your 400k limit by 40.000₫',
    );
    const follow = page
      .getByRole('region', { name: 'Chat', exact: true })
      .locator('section')
      .last();
    await expect(follow.locator('p')).toHaveText(/\?$/);
    expect(await follow.getByRole('button').count()).toBeGreaterThanOrEqual(2);
    await page.getByRole('tab', { name: /Premium/ }).click();
    await page.getByRole('tab', { name: /Balanced/ }).click();
    await say(page, 'Is the Minh An backpack really anti-hunchback?');
    await expect(page.getByTestId('user-turn')).toHaveCount(2, {
      timeout: 120000,
    });
    await expect
      .poll(async () => (await thread(page)).messages.length, {
        timeout: 120000,
      })
      .toBe(1);
    await expect(page.getByLabel('Message Kitly')).toBeEnabled({
      timeout: 120000,
    });
    await ready(page, 1);
    const answer = (await thread(page)).messages[0].answer;
    await expect(
      page.getByRole('region', { name: 'Chat', exact: true }),
    ).toContainText(answer);
    expect(answer).toMatch(/strap|spine/i);
    await say(page, 'School gives the uniform, cut the budget to 1M.');
    await ready(page, 2);
    await expect(
      page.getByRole('button', { name: 'Edit budget', exact: true }),
    ).toContainText('1.000.000₫');
    const v2 = (await thread(page)).versions.at(-1)!;
    expect(v2.plan.items.some((i) => i.category === 'uniform-shirt')).toBe(
      false,
    );
    expect(
      v2.options.find((o) => o.profile === 'balanced')!.grandTotal,
    ).toBeLessThanOrEqual(1000000);
    await expect(
      page.getByRole('region', { name: 'Chat', exact: true }),
    ).toContainText(/Removed:.*uniform/i);
    const bottle = v2.options
      .find((o) => o.profile === 'balanced')!
      .lines.find((l) => l.product.category === 'water-bottle');
    expect(bottle).toBeDefined();
    await page
      .getByRole('button', {
        name: `Remove ${bottle!.product.title}`,
        exact: true,
      })
      .click();
    await ready(page, 3);
    await expect(
      page.getByRole('region', { name: 'Chat', exact: true }),
    ).toContainText(/Removed:.*water bottle/i);
    await page.reload();
    await ready(page, 3);
    await expect(
      page.getByRole('region', { name: 'Chat', exact: true }),
    ).toContainText(answer);
    await expect(page.getByTestId('user-turn')).toHaveCount(3);
    const other = await browser.newContext();
    try {
      const isolated = await other.newPage();
      await isolated.goto(saved);
      await expect(
        isolated.getByText('Kit not found. It may belong to another browser.'),
      ).toBeVisible();
    } finally {
      await other.close();
    }
    const after = backpackGap(await insights(page));
    expect(after.thisWeek).toBe(baseline + 1);
    await page.goto('/seller?shop=shop-minhan');
    const gap = page
      .getByTestId('gap-card')
      .filter({ hasText: 'Minh An Kids Backpack New Model 2026' })
      .first();
    await expect(page.getByTestId('recent-need').first()).toContainText(
      'Anti-hunchback backpack',
      { timeout: 30000 },
    );
    await expect(gap).toContainText(`${baseline + 1} this week`);
    await expect(gap).toContainText('21 last week');
    expect(after.priceBand).not.toBeNull();
    await expect(gap).toContainText(
      `${money(after.priceBand!.p25)}–${money(after.priceBand!.p75)}`,
    );
    await expect(gap).toContainText('Listing gap');
    await expect(gap).toContainText(/spine straight/i);
    const rain = page
      .getByTestId('gap-card')
      .filter({ hasText: 'Kids raincoat with backpack cover' });
    await expect(rain).toContainText('Assortment gap');
    await expect(rain).toContainText('0 shops selling');
    await expect(rain).toContainText('School backpack');
    await expect(
      rain.getByRole('button', { name: /add product/i }),
    ).toHaveCount(0);
    await expect(page.getByTestId('gap-card').first()).toContainText(
      'Anti-hunchback backpack',
    );
    const proposalResponse = page.waitForResponse((response) =>
      response.url().endsWith('/api/seller/enrichment/preview'),
    );
    await gap.getByRole('button', { name: 'Preview fix' }).click();
    const drawer = page.getByRole('dialog');
    await expect(drawer).toBeVisible({ timeout: 120000 });
    await expect(drawer).toContainText('Old keywords still match ✓');
    await expect(drawer).toContainText('anti-hunchback');
    const proposal: EnrichmentPreviewResponse = await (
      await proposalResponse
    ).json();
    expect(proposal.after.title.startsWith(proposal.before.title)).toBe(true);
    expect(proposal.added.tags).toContain('anti-hunchback');
    for (const keyword of proposal.keywordCheck) {
      expect(keyword.stillMatches).toBe(true);
      await expect(
        drawer.getByText(`${keyword.keyword} ✓`, { exact: true }),
      ).toBeVisible();
    }
    const apply = page.waitForResponse((r) =>
      r.url().endsWith('/api/seller/enrichment/apply'),
    );
    await drawer.getByRole('button', { name: 'Apply enrichment' }).click();
    expect((await apply).ok()).toBeTruthy();
    applied = true;
    await expect(gap.getByText('Fixed', { exact: true })).toBeVisible({
      timeout: 30000,
    });
    await page.reload();
    await expect(page.getByText('Fixed', { exact: true })).toBeVisible({
      timeout: 30000,
    });
    await page
      .getByRole('link', { name: 'Back to buyer', exact: false })
      .click();
    await page.getByRole('link', { name: 'New kit', exact: true }).click();
    await say(page, hero);
    await ready(page, 1);
    await expect(
      page
        .getByTestId('basket')
        .getByRole('link', { name: /Minh An Kids Backpack/ }),
    ).toBeVisible();
    await expect(page.getByTestId('basket')).toContainText(
      'Updated for this need',
    );
    const loop = (await thread(page)).versions[0].options.find(
      (o) => o.profile === 'balanced',
    )!;
    expect(loop.grandTotal).toBeLessThanOrEqual(1500000);
    await page.goto('/seller?shop=shop-minhan');
    await page.getByRole('button', { name: 'Undo', exact: true }).click();
    await expect(
      page.getByText('Listing restored.', { exact: true }),
    ).toBeVisible({ timeout: 30000 });
    applied = false;
    const restored = await page.request.get(
      '/api/products/prod-minhan-backpack',
    );
    expect((await restored.json()).product).toEqual(beforeProduct);
    await page.goto('/kit/new');
    await page.getByRole('button', { name: /👤 Lan/ }).click();
    await page.getByRole('menuitem', { name: 'Guest' }).click();
    await say(page, hero);
    await ready(page, 1);
    await expect(
      page.getByRole('button', { name: '👤 Guest', exact: true }),
    ).toBeVisible();
    await expect(
      page.getByText('💛 In your cart', { exact: true }),
    ).toHaveCount(0);
    await expect(page.getByText(/Your wallet voucher/)).toHaveCount(0);
    await expect(page.getByText(/Deliver to/)).toHaveCount(0);
  } finally {
    // Cleanup is independent of browser navigation/assertions, including failures after Apply.
    if (applied) {
      const undone = await page.request.post('/api/seller/enrichment/undo', {
        data: { productId: 'prod-minhan-backpack' },
      });
      expect(undone.ok()).toBeTruthy();
    }
    const persona = await page.request.post('/api/persona', {
      data: { id: 'lan' },
    });
    expect(persona.ok()).toBeTruthy();
  }
});
