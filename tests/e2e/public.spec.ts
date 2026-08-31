import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
test('B pricing asks for transmission and L17, with manual only outside Prague', async ({
  page,
}) => {
  await page.goto('/cenik');
  await expect(page.locator('#pricing-results')).toBeHidden();
  await page.getByRole('button', { name: 'Auto a L17', exact: true }).click();
  await page.getByRole('button', { name: /^Kladno/ }).click();
  await expect(page.getByRole('button', { name: /Automat/ })).toBeDisabled();
  await page.getByRole('button', { name: 'Manuál', exact: true }).click();
  await page.getByRole('button', { name: /Kurz skupiny B/ }).click();
  await expect(page.locator('#offer-price')).toHaveText('20 000 Kč');
  await expect(page.locator('#offer-variant')).toHaveText('Manuál');
  await expect(page.locator('.offer-price')).toContainText(
    'Cena kurzu nezahrnuje poplatky za zkoušku.',
  );
});

test('Moto and trailer courses are available only in Prague', async ({ page }) => {
  await page.goto('/cenik');
  await page.getByRole('button', { name: 'Motorku', exact: true }).click();
  await page.getByRole('button', { name: /^Kladno/ }).click();
  await expect(page.locator('#availability-message')).toContainText('pouze na pobočce Střížkov');
  await expect(page.locator('#pricing-results')).toBeHidden();
  await page.getByRole('button', { name: 'Auto s přívěsem', exact: true }).click();
  await expect(page.locator('#availability-message')).toContainText('pouze na pobočce Střížkov');
});

test('A1 without a licence offers only extended Moto Jistota', async ({ page }) => {
  await page.goto('/cenik');
  await page.getByRole('button', { name: 'Motorku', exact: true }).click();
  await page.getByRole('button', { name: /^Střížkov/ }).click();
  await page.getByRole('button', { name: 'A1', exact: true }).click();
  await page.getByRole('button', { name: 'Nemám žádné', exact: true }).click();
  await expect(page.locator('#offer-price')).toHaveText('31 900 Kč');
  await expect(page.locator('#offer-variant')).toHaveText(
    'Moto Jistota · 20 hodin jízd · 2 hodiny teorie navíc',
  );
  await expect(page.locator('#package-question')).toBeHidden();
});

test('A1 to A2 after more than two years offers the supplementary exam course', async ({
  page,
}) => {
  await page.goto('/cenik');
  await page.getByRole('button', { name: 'Motorku', exact: true }).click();
  await page.getByRole('button', { name: /^Střížkov/ }).click();
  await page.getByRole('button', { name: 'A2', exact: true }).click();
  await page.getByRole('button', { name: 'Ano, mám', exact: true }).click();
  await page.locator('#licences-question label').filter({ hasText: /^B$/ }).click();
  await page.locator('#licences-question label').filter({ hasText: /^A1$/ }).click();
  await page.getByRole('button', { name: 'Déle než 2 roky', exact: true }).click();
  await expect(page.locator('#offer-price')).toHaveText('7 500 Kč');
  await expect(page.locator('#offer-variant')).toHaveText('Doplňovací zkouška · 4 hodiny jízd');
});

test('A1 to A2 within two years keeps both extension packages', async ({ page }) => {
  await page.goto('/cenik');
  await page.getByRole('button', { name: 'Motorku', exact: true }).click();
  await page.getByRole('button', { name: /^Střížkov/ }).click();
  await page.getByRole('button', { name: 'A2', exact: true }).click();
  await page.getByRole('button', { name: 'Ano, mám', exact: true }).click();
  await page.locator('#licences-question label').filter({ hasText: /^A1$/ }).click();
  await page.getByRole('button', { name: '2 roky nebo méně', exact: true }).click();
  await expect(page.locator('#package-question')).toBeVisible();
  await page.getByRole('button', { name: /Moto Základ/ }).click();
  await expect(page.locator('#offer-price')).toHaveText('24 900 Kč');
  await page.getByRole('button', { name: /Moto Jistota/ }).click();
  await expect(page.locator('#offer-price')).toHaveText('31 900 Kč');
});
test('Prefilled order, server price, contact back navigation and honest booking blocker', async ({
  page,
}) => {
  await page.goto('/cenik');
  await page.getByRole('button', { name: 'Auto a L17', exact: true }).click();
  await page.getByRole('button', { name: /^Střížkov/ }).click();
  await page.getByRole('button', { name: 'Manuál', exact: true }).click();
  await page.getByRole('button', { name: /Kurz skupiny B/ }).click();
  await page.locator('.offer-card [data-order]').click();
  const dialog = page.getByRole('dialog');
  await expect(dialog.getByRole('combobox', { name: 'Pobočka', exact: true })).toHaveValue(
    'strizkov',
  );
  await expect(dialog.locator('#quote-amount')).toHaveText('24 900 Kč');
  await dialog.getByRole('button', { name: 'Pokračovat →', exact: true }).click();
  await dialog.getByLabel('Jméno', { exact: true }).fill('Fiktivní');
  await dialog.getByLabel('Příjmení', { exact: true }).fill('Test');
  await dialog.getByLabel('E-mail', { exact: true }).fill('fixture@example.invalid');
  await dialog.getByLabel('Telefon', { exact: true }).fill('+420000000000');
  await dialog.getByRole('button', { name: 'Zpět', exact: true }).click();
  await dialog.getByRole('button', { name: 'Pokračovat →', exact: true }).click();
  await expect(dialog.getByLabel('Jméno', { exact: true })).toHaveValue('Fiktivní');
  await dialog.getByRole('button', { name: 'Pokračovat →', exact: true }).click();
  await expect(dialog.getByText('Rezervace zatím není aktivní.')).toBeVisible();
  await expect(dialog.locator('[name="marketing"]')).not.toBeChecked();
  await expect(dialog.locator('[name="terms"]')).not.toBeChecked();
});
test('Six-step journey reveals the selected detail', async ({ page }) => {
  await page.goto('/');
  const finalStep = page.getByRole('button', { name: /06 Závěrečná zkouška/ });
  await finalStep.click();
  await expect(finalStep).toHaveAttribute('aria-pressed', 'true');
  await expect(finalStep).toHaveAttribute('aria-expanded', 'true');
  await expect(page.locator('#road-detail-5')).toContainText('Teoretická část závěrečné zkoušky');
  await expect(page.getByRole('button', { name: /01 Online objednávka/ })).toHaveAttribute(
    'aria-pressed',
    'false',
  );
});
for (const course of ['am', 'a1', 'a2', 'a'])
  test(`Moto ${course} no licence: only Jistota`, async ({ page }) => {
    await page.goto('/');
    await page.getByRole('button', { name: 'Přihlásit se ↗', exact: true }).click();
    const dialog = page.getByRole('dialog');
    await dialog.getByRole('combobox', { name: 'Pobočka', exact: true }).selectOption('strizkov');
    await dialog.getByRole('combobox', { name: 'Kurz', exact: true }).selectOption(course);
    await expect(dialog.locator('#quote-amount')).toHaveText('31 900 Kč');
    await expect(dialog.locator('[name="package"] option')).toHaveCount(1);
    await expect(dialog.locator('#quote-note')).toContainText('2 hodiny teorie navíc');
  });
test('Dialog keyboard confinement, safe discard and focus restoration', async ({ page }) => {
  await page.goto('/');
  const trigger = page.getByRole('button', { name: 'Přihlásit se ↗', exact: true });
  await trigger.click();
  const dialog = page.getByRole('dialog');
  await dialog.getByRole('combobox', { name: 'Pobočka', exact: true }).selectOption('kladno');
  await page.keyboard.press('Escape');
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole('button', { name: 'Pokračovat ve výběru' })).toBeFocused();
  await dialog.getByRole('button', { name: 'Zahodit a zavřít' }).click();
  await expect(dialog).not.toBeVisible();
  await expect(trigger).toBeFocused();
  await trigger.click();
  for (let i = 0; i < 15; i++) {
    await page.keyboard.press('Tab');
    expect(await page.evaluate(() => !!document.activeElement?.closest('dialog'))).toBe(true);
  }
});
test('Reject price tampering and foreign origin', async ({ request }) => {
  const tampered = await request.post('/api/quote', {
    headers: { origin: 'http://127.0.0.1:4322' },
    data: { course: 'b', branch: 'kladno', amount: 1 },
  });
  expect(tampered.status()).toBe(422);
  const foreign = await request.post('/api/quote', {
    headers: { origin: 'https://example.com' },
    data: { course: 'b', branch: 'kladno' },
  });
  expect(foreign.status()).toBe(403);
});
for (const path of ['/', '/cenik', '/strizkov', '/kurzy/ridicak-skupina-b', '/blog'])
  test(`WCAG automated checks ${path}`, async ({ page }) => {
    await page.goto(path);
    const result = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa'])
      .analyze();
    expect(result.violations).toEqual([]);
    await expect(page.locator('h1')).toHaveCount(1);
  });
test('Mobile layout and fullscreen dialog', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );
  await page.getByRole('button', { name: 'Menu' }).click();
  await page.getByRole('button', { name: 'Přihlásit se ↗', exact: true }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
  expect(await page.getByRole('dialog').evaluate((el) => el.getBoundingClientRect().width)).toBe(
    390,
  );
  const result = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa'])
    .analyze();
  expect(result.violations).toEqual([]);
});
