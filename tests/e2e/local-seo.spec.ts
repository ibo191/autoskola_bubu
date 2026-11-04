import { expect, test } from '@playwright/test';

test('branch menu works with keyboard on desktop and exposes crawlable links', async ({ page }) => {
  await page.goto('/');
  const menu = page.locator('.branch-menu');
  await menu.locator('summary').focus();
  await page.keyboard.press('Enter');
  await expect(menu).toHaveAttribute('open', '');
  await expect(menu.getByRole('link', { name: 'Praha 8 – Střížkov' })).toHaveAttribute('href', '/strizkov');
  await expect(menu.getByRole('link', { name: 'Kladno' })).toHaveAttribute('href', '/kladno');
  await expect(menu.getByRole('link', { name: 'Statenice' })).toHaveAttribute('href', '/statenice');
});

test('branch menu is accessible in the mobile navigation', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await page.locator('.menu-toggle').click();
  await page.locator('.branch-menu summary').click();
  await expect(page.locator('.branch-menu a')).toHaveCount(3);
  await expect(page.locator('.branch-menu a').first()).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test('local pages have canonical URLs and contextual course links', async ({ page }) => {
  for (const branch of ['strizkov', 'kladno']) {
    await page.goto(`/${branch}`);
    await expect(page.locator('link[rel="canonical"]')).toHaveAttribute(
      'href',
      `https://www.autoskolabubu.cz/${branch}`,
    );
    await expect(page.locator('a[href="/kurzy/ridicak-skupina-b"]').first()).toBeVisible();
  }
});

test('new local links resolve and navigation fits desktop width', async ({ page }) => {
  await page.setViewportSize({ width: 1024, height: 768 });
  await page.goto('/');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  for (const path of [
    '/strizkov', '/kladno', '/statenice', '/cenik', '/kurzy/ridicak-skupina-b',
    '/kurzy/ridicak-skupina-b-automat', '/kurzy/l17', '/kurzy/kondicni-jizdy',
  ]) {
    const response = await page.request.get(path);
    expect(response.status(), path).toBe(200);
  }
});

test('local landing pages render without browser errors', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('/strizkov');
  await page.goto('/kladno');
  expect(errors).toEqual([]);
});
