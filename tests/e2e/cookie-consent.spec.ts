import { test, expect } from '@playwright/test';

const cookieName = 'bubu_cookie_consent';
const googleTagId = 'AW-17619012335';
const googleTagManagerId = 'GTM-PGNDXXCL';

test('cookie consent starts with optional categories disabled and can be reopened from footer', async ({
  page,
}) => {
  await page.context().clearCookies();
  await page.goto('/');

  const banner = page.locator('[data-cookie-banner]');
  await expect(banner).toBeVisible();
  await expect(page.locator('[data-cookie-panel]')).toBeHidden();
  const box = await banner.boundingBox();
  expect(box).not.toBeNull();
  expect((box?.y ?? 0) + (box?.height ?? 0)).toBeLessThanOrEqual(page.viewportSize()!.height);

  await page.getByRole('button', { name: 'Nastavit cookies' }).click();
  const panel = page.locator('[data-cookie-panel]');
  await expect(panel).toBeVisible();
  await expect(panel.locator('[data-cookie-category="analytics"]')).not.toBeChecked();
  await expect(panel.locator('[data-cookie-category="marketing"]')).not.toBeChecked();

  await panel.locator('[data-cookie-category="analytics"]').check();
  await page.getByRole('button', { name: 'Uložit nastavení' }).click();
  await expect(page.locator('[data-cookie-consent]')).toBeHidden();

  const stored = (await page.context().cookies()).find((cookie) => cookie.name === cookieName);
  expect(stored).toBeTruthy();
  const parsed = JSON.parse(decodeURIComponent(stored?.value ?? ''));
  expect(parsed).toMatchObject({ version: 1, necessary: true, analytics: true, marketing: false });

  await page.getByRole('button', { name: 'Nastavení cookies' }).click();
  await expect(panel).toBeVisible();
  await expect(panel.locator('[data-cookie-category="analytics"]')).toBeChecked();
  await expect(panel.locator('[data-cookie-category="marketing"]')).not.toBeChecked();
});

test('rejecting optional cookies persists and does not call tracking endpoints', async ({
  page,
}) => {
  const requestedHosts: string[] = [];
  page.on('request', (request) => requestedHosts.push(new URL(request.url()).hostname));

  await page.context().clearCookies();
  await page.goto('/');
  await page.getByRole('button', { name: 'Jen nezbytné' }).click();
  await expect(page.locator('[data-cookie-consent]')).toBeHidden();

  const stored = (await page.context().cookies()).find((cookie) => cookie.name === cookieName);
  expect(stored).toBeTruthy();
  const parsed = JSON.parse(decodeURIComponent(stored?.value ?? ''));
  expect(parsed).toMatchObject({ version: 1, necessary: true, analytics: false, marketing: false });

  expect(requestedHosts).not.toContain('www.googletagmanager.com');
  expect(requestedHosts).not.toContain('www.google-analytics.com');
  expect(requestedHosts).not.toContain('googleads.g.doubleclick.net');
  expect(requestedHosts).not.toContain('connect.facebook.net');
  expect(requestedHosts).not.toContain('www.facebook.com');
});

test('analytics consent loads one Google tag with the Ads loader ID', async ({ page }) => {
  await page.context().clearCookies();
  await page.goto('/');

  const configuredTagId = await page.locator('body').getAttribute('data-google-tag-id');
  test.skip(configuredTagId !== googleTagId, 'Google tag environment variable is not configured.');

  const requestedUrls: string[] = [];
  await page.route(`https://www.googletagmanager.com/gtag/js?id=${googleTagId}`, async (route) => {
    requestedUrls.push(route.request().url());
    await route.fulfill({ status: 200, contentType: 'application/javascript', body: '' });
  });

  await page.getByRole('button', { name: 'Souhlasím se vším' }).click();
  await expect.poll(() => requestedUrls).toHaveLength(1);
  expect(requestedUrls[0]).toBe(`https://www.googletagmanager.com/gtag/js?id=${googleTagId}`);

  const commands = await page.evaluate(() =>
    (window.dataLayer ?? [])
      .filter((entry): entry is IArguments => 'length' in entry)
      .map((entry) => Array.from(entry).map(String)),
  );
  expect(commands).toContainEqual(['config', googleTagId, '[object Object]']);
  expect(commands).toContainEqual(['consent', 'default', '[object Object]']);
});

test('GTM container loads once after consent and never before it', async ({ page }) => {
  await page.context().clearCookies();
  const managerRequests: string[] = [];
  await page.route(
    `https://www.googletagmanager.com/gtm.js?id=${googleTagManagerId}`,
    async (route) => {
      managerRequests.push(route.request().url());
      await route.fulfill({ status: 200, contentType: 'application/javascript', body: '' });
    },
  );
  await page.route(`https://www.googletagmanager.com/gtag/js?id=${googleTagId}`, (route) =>
    route.fulfill({ status: 200, contentType: 'application/javascript', body: '' }),
  );
  await page.goto('/');
  test.skip(
    (await page.locator('body').getAttribute('data-google-tag-id')) !== googleTagId,
    'Google tag environment variable is not configured.',
  );
  expect(managerRequests).toHaveLength(0);
  await page.getByRole('button', { name: 'Souhlasím se vším' }).click();
  await expect.poll(() => managerRequests.length).toBe(1);
  await page.evaluate(() =>
    document.dispatchEvent(
      new CustomEvent('bubu:cookie-consent-updated', {
        detail: { analytics: true, marketing: true },
      }),
    ),
  );
  expect(managerRequests).toHaveLength(1);
  expect(
    await page
      .locator(`script[src="https://www.googletagmanager.com/gtm.js?id=${googleTagManagerId}"]`)
      .count(),
  ).toBe(1);
});

test('old consent version asks for a fresh choice', async ({ page }) => {
  await page.context().addCookies([
    {
      name: cookieName,
      value: encodeURIComponent(
        JSON.stringify({ version: 0, necessary: true, analytics: true, marketing: true }),
      ),
      domain: '127.0.0.1',
      path: '/',
    },
  ]);
  await page.goto('/');
  await expect(page.locator('[data-cookie-banner]')).toBeVisible();
});

test('marketing-only consent grants ads without enabling analytics storage', async ({ page }) => {
  await page.context().clearCookies();
  await page.goto('/kladno');
  const configuredTagId = await page.locator('body').getAttribute('data-google-tag-id');
  test.skip(configuredTagId !== googleTagId, 'Google tag environment variable is not configured.');
  await page.route(`https://www.googletagmanager.com/gtag/js?id=${googleTagId}`, (route) =>
    route.fulfill({ status: 200, contentType: 'application/javascript', body: '' }),
  );
  await page.getByRole('button', { name: 'Nastavit cookies' }).click();
  await page.locator('[data-cookie-category="marketing"]').check();
  await page.getByRole('button', { name: 'Uložit nastavení' }).click();
  const commands = await page.evaluate(() =>
    (window.dataLayer ?? [])
      .filter((entry): entry is IArguments => 'length' in entry)
      .map((entry) => Array.from(entry)),
  );
  expect(commands).toContainEqual([
    'consent',
    'update',
    {
      analytics_storage: 'denied',
      ad_storage: 'granted',
      ad_user_data: 'granted',
      ad_personalization: 'granted',
    },
  ]);
  expect(commands.some((entry) => entry[0] === 'event' && entry[1] === 'page_view')).toBe(false);
});

test('lead tracking waits for consent and emits one deduplicated payload after confirmed order', async ({
  page,
}) => {
  await page.context().clearCookies();
  await page.goto('/kladno');
  const configuredTagId = await page.locator('body').getAttribute('data-google-tag-id');
  test.skip(configuredTagId !== googleTagId, 'Google tag environment variable is not configured.');
  await page.route(`https://www.googletagmanager.com/gtag/js?id=${googleTagId}`, (route) =>
    route.fulfill({ status: 200, contentType: 'application/javascript', body: '' }),
  );

  const applicationId = '11111111-2222-4333-8444-555555555555';
  await page.evaluate((id) => {
    sessionStorage.setItem(
      'bubu:pending-lead',
      JSON.stringify({
        publicCode: 'BUBU-TEST1234',
        applicationId: id,
        branch: 'kladno',
        course: 'b',
      }),
    );
    const summary = document.createElement('div');
    summary.className = 'conversion-summary';
    summary.dataset.publicCode = 'BUBU-TEST1234';
    summary.dataset.branch = 'kladno';
    summary.dataset.course = 'b';
    document.body.append(summary);
  }, applicationId);

  const leads = () =>
    page.evaluate(() =>
      (window.dataLayer ?? []).filter(
        (entry): entry is Record<string, string | number> =>
          'event' in entry && entry.event === 'generate_lead',
      ),
    );
  expect(await leads()).toHaveLength(0);
  await page.getByRole('button', { name: 'Souhlasím se vším' }).click();
  await expect.poll(async () => (await leads()).length).toBe(1);
  expect(await leads()).toEqual([
    {
      event: 'generate_lead',
      branch: 'kladno',
      course: 'B',
      application_id: applicationId,
    },
  ]);
  await page.evaluate(() =>
    document.dispatchEvent(
      new CustomEvent('bubu:cookie-consent-updated', {
        detail: { analytics: true, marketing: true },
      }),
    ),
  );
  expect(await leads()).toHaveLength(1);
});

test('failed Kladno submission never emits generate_lead', async ({ page }) => {
  await page.context().clearCookies();
  await page.goto('/kladno');
  const configuredTagId = await page.locator('body').getAttribute('data-google-tag-id');
  test.skip(configuredTagId !== googleTagId, 'Google tag environment variable is not configured.');
  await page.route(`https://www.googletagmanager.com/gtag/js?id=${googleTagId}`, (route) =>
    route.fulfill({ status: 200, contentType: 'application/javascript', body: '' }),
  );
  await page.getByRole('button', { name: 'Souhlasím se vším' }).click();
  await page.route('**/api/orders', (route) =>
    route.fulfill({
      status: 422,
      contentType: 'application/json',
      body: JSON.stringify({ ok: false, code: 'STORAGE_FAILED' }),
    }),
  );
  await page
    .getByRole('button', { name: /Přihlásit se do autoškoly/ })
    .first()
    .click();
  const applicationEvents = await page.evaluate(() =>
    (window.dataLayer ?? []).filter(
      (entry) =>
        'event' in entry && ['begin_application', 'select_course'].includes(String(entry.event)),
    ),
  );
  expect(applicationEvents).toEqual([
    { event: 'begin_application', branch: 'kladno', course: 'B' },
    { event: 'select_course', branch: 'kladno', course: 'B' },
  ]);
  const dialog = page.getByRole('dialog');
  await dialog.getByRole('button', { name: 'Pokračovat →' }).click();
  await dialog.getByLabel('Jméno', { exact: true }).fill('Test');
  await dialog.getByLabel('Příjmení', { exact: true }).fill('Žák');
  await dialog.getByLabel('E-mail', { exact: true }).fill('test@example.invalid');
  await dialog.getByLabel('Telefon', { exact: true }).fill('+420777123456');
  await dialog.getByRole('button', { name: 'Pokračovat →' }).click();
  await dialog.locator('[name="terms"]').check();
  await dialog.getByRole('button', { name: 'Odeslat objednávku' }).click();
  await expect(dialog.locator('#order-error')).toContainText('Objednávku se nepodařilo uložit');
  const leads = await page.evaluate(() =>
    (window.dataLayer ?? []).filter((entry) => 'event' in entry && entry.event === 'generate_lead'),
  );
  expect(leads).toHaveLength(0);
  expect(await page.evaluate(() => sessionStorage.getItem('bubu:pending-lead'))).toBeNull();
});
