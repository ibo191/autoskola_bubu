import { test, expect } from '@playwright/test';

const cookieName = 'bubu_cookie_consent';

test('cookie consent starts with optional categories disabled and can be reopened from footer', async ({
  page,
}) => {
  await page.context().clearCookies();
  await page.goto('/');

  const banner = page.locator('[data-cookie-banner]');
  await expect(banner).toBeVisible();
  await expect(page.locator('[data-cookie-panel]')).toBeHidden();

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
