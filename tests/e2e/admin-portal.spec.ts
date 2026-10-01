import { expect, test } from '@playwright/test';
import { readFileSync } from 'node:fs';
import ts from 'typescript';

const script = ts.transpileModule(
  readFileSync(new URL('../../src/scripts/admin-portal.ts', import.meta.url), 'utf8'),
  { compilerOptions: { target: ts.ScriptTarget.ES2022 } },
).outputText;

function dashboardHtml(query: string, actionResult: string | null) {
  return `<!doctype html><html><head><meta charset="utf-8" /></head><body>
    <section class="admin-section" data-admin-enhance="true">
      <div data-admin-panel="overview" style="height:700px">Přehled</div>
      <div data-admin-panel="orders" style="height:900px">
        <h2>Objednávky ${query || 'všechny'}</h2>
        ${actionResult === 'attended' ? '<div class="notice">Nástup potvrzen</div>' : ''}
        <form method="get" action="/sprava">
          <input name="q" value="${query}" aria-label="Hledat" />
          <button type="submit">Filtrovat</button>
        </form>
        <form method="post" action="/sprava/action">
          <input type="hidden" name="intent" value="attend" />
          <input type="hidden" name="orderId" value="11111111-1111-4111-8111-111111111111" />
          <button type="submit">Potvrdit nástup</button>
        </form>
      </div>
    </section></body></html>`;
}

test('admin filters and actions update in place without losing scroll position', async ({
  page,
}) => {
  let documentRequests = 0;
  page.on('request', (request) => {
    if (request.resourceType() === 'document') documentRequests++;
  });
  await page.route('**/sprava**', async (route) => {
    const url = new URL(route.request().url());
    if (url.pathname === '/sprava/action') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ redirectTo: '/sprava?q=Roz%C3%A1lie&actionResult=attended' }),
      });
      return;
    }
    await route.fulfill({
      status: 200,
      contentType: 'text/html',
      body: dashboardHtml(url.searchParams.get('q') ?? '', url.searchParams.get('actionResult')),
    });
  });

  await page.goto('/sprava');
  await page.addScriptTag({ content: script });
  await page.evaluate(() => window.scrollTo(0, 760));
  await page.getByRole('textbox', { name: 'Hledat' }).fill('Rozálie');
  await page.getByRole('button', { name: 'Filtrovat' }).click();
  await expect(page.getByRole('heading', { name: 'Objednávky Rozálie' })).toBeVisible();
  expect(await page.evaluate(() => window.scrollY)).toBeGreaterThan(600);
  expect(documentRequests).toBe(1);

  await page.getByRole('button', { name: 'Potvrdit nástup' }).click();
  await expect(page.locator('#admin-ajax-status')).toContainText('Nástup potvrzen');
  expect(await page.evaluate(() => window.scrollY)).toBeGreaterThan(600);
  expect(documentRequests).toBe(1);

  await page.goBack();
  await expect(page.getByRole('heading', { name: 'Objednávky všechny' })).toBeVisible();
  expect(documentRequests).toBe(1);
});

test('failed admin action keeps the current view and allows retry', async ({ page }) => {
  let documentRequests = 0;
  page.on('request', (request) => {
    if (request.resourceType() === 'document') documentRequests++;
  });
  await page.route('**/sprava**', async (route) => {
    if (new URL(route.request().url()).pathname === '/sprava/action') {
      await route.fulfill({
        status: 409,
        contentType: 'text/plain',
        body: 'Akci se nepodařilo provést.',
      });
      return;
    }
    await route.fulfill({ status: 200, contentType: 'text/html', body: dashboardHtml('', null) });
  });
  await page.goto('/sprava');
  await page.addScriptTag({ content: script });
  await page.evaluate(() => window.scrollTo(0, 760));
  await page.getByRole('button', { name: 'Potvrdit nástup' }).click();
  await expect(page.locator('#admin-ajax-status')).toContainText('Akci se nepodařilo provést.');
  await expect(page.getByRole('button', { name: 'Potvrdit nástup' })).toBeEnabled();
  expect(await page.evaluate(() => window.scrollY)).toBeGreaterThan(600);
  expect(documentRequests).toBe(1);
});
