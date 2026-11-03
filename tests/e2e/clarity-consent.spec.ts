import { expect, test } from '@playwright/test';

test('Clarity initializes only after analytics consent and receives Consent V2', async ({ page }) => {
  await page.route('https://www.clarity.ms/tag/**', (route) =>
    route.fulfill({ contentType: 'application/javascript', body: "window.clarity('event', 'loaded')" }),
  );
  await page.goto('/');
  await expect(page.locator('script[src*="clarity.ms/tag/"]')).toHaveCount(0);
  await page.locator('[data-cookie-accept]').click();
  await expect(page.locator('script[src*="clarity.ms/tag/z57v04mb3d"]')).toHaveCount(1);
  const queue = await page.evaluate(() =>
    (window as typeof window & { clarity?: { q?: unknown[][] } }).clarity?.q,
  );
  expect(queue).toContainEqual([
    'consentv2',
    { ad_Storage: 'granted', analytics_Storage: 'granted' },
  ]);
  expect(queue).toContainEqual(['event', 'loaded']);
});

test('Clarity remains absent from internal administration', async ({ page }) => {
  await page.goto('/sprava');
  await expect(page.locator('script[src*="clarity"]')).toHaveCount(0);
});

test('analytics-only consent denies Microsoft Ads storage', async ({ page, context }) => {
  await context.addCookies([{
    name: 'bubu_cookie_consent',
    value: encodeURIComponent(JSON.stringify({ version: 1, analytics: true, marketing: false })),
    url: 'http://127.0.0.1:4322',
  }]);
  await page.route('https://www.clarity.ms/tag/**', (route) =>
    route.fulfill({ contentType: 'application/javascript', body: '' }),
  );
  await page.goto('/');
  await expect(page.locator('script[src*="clarity.ms/tag/z57v04mb3d"]')).toHaveCount(1);
  const queue = await page.evaluate(() =>
    (window as typeof window & { clarity?: { q?: unknown[][] } }).clarity?.q,
  );
  expect(queue).toContainEqual([
    'consentv2',
    { ad_Storage: 'denied', analytics_Storage: 'granted' },
  ]);
});

test('CSP permits Clarity tag, runtime and consent image endpoints', async ({ page }) => {
  await page.goto('/');
  const policy = await page.locator('meta[http-equiv="content-security-policy"]').getAttribute('content');
  expect(policy).toContain('https://www.clarity.ms');
  expect(policy).toContain('https://scripts.clarity.ms');
  expect(policy).toContain('https://c.bing.com');
});
