import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
test('B pricing asks for transmission and L17, with manual only outside Prague', async ({
  page,
}) => {
  await page.goto('/cenik');
  await expect(page.locator('#pricing-results')).toBeHidden();
  await page.getByRole('button', { name: /^Auto \/ L17/ }).click();
  await page.getByRole('button', { name: /^Kladno/ }).click();
  await expect(page.getByRole('button', { name: /Automat/ })).toBeDisabled();
  await page.getByRole('button', { name: 'Manuál', exact: true }).click();
  await page.getByRole('button', { name: /Kurz skupiny B/ }).click();
  await expect(page.locator('#offer-price')).toHaveText('21 000 Kč');
  await expect(page.locator('#offer-variant')).toHaveText('Manuál');
  await expect(page.locator('.offer-price')).toContainText('Nezahrnuje poplatky za zkoušku.');
});

test('Moto enrollment is paused in the price guide while trailer courses remain Prague-only', async ({ page }) => {
  await page.goto('/cenik');
  await page.getByRole('button', { name: /^Motorku/ }).click();
  await expect(page.locator('#availability-message')).toContainText('Přihlašování do motocyklových kurzů je momentálně pozastavené');
  await expect(page.locator('#pricing-results')).toBeHidden();
  await page.getByRole('button', { name: /^Auto s přívěsem/ }).click();
  await page.getByRole('button', { name: /^Kladno/ }).click();
  await expect(page.locator('#availability-message')).toContainText('pouze na pobočce Střížkov');
});

test('Prefilled order, server price, contact back navigation and booking calendar', async ({
  page,
}) => {
  await page.goto('/cenik');
  await page.getByRole('button', { name: /^Auto \/ L17/ }).click();
  await page.getByRole('button', { name: /^Střížkov/ }).click();
  await page.getByRole('button', { name: 'Manuál', exact: true }).click();
  await page.getByRole('button', { name: /Kurz skupiny B/ }).click();
  await page.locator('.offer-card [data-order]').click();
  const dialog = page.getByRole('dialog');
  await expect(dialog.getByRole('combobox', { name: 'Pobočka', exact: true })).toHaveValue(
    'strizkov',
  );
  await expect(dialog.locator('#quote-amount')).toHaveText('25 900 Kč');
  await dialog.getByRole('button', { name: 'Pokračovat →', exact: true }).click();
  await dialog.getByLabel('Jméno', { exact: true }).fill('Fiktivní');
  await dialog.getByLabel('Příjmení', { exact: true }).fill('Test');
  await dialog.getByLabel('E-mail', { exact: true }).fill('fixture@example.invalid');
  await dialog.getByLabel('Telefon', { exact: true }).fill('+420000000000');
  await dialog.getByRole('button', { name: 'Zpět', exact: true }).click();
  await dialog.getByRole('button', { name: 'Pokračovat →', exact: true }).click();
  await expect(dialog.getByLabel('Jméno', { exact: true })).toHaveValue('Fiktivní');
  await dialog.getByRole('button', { name: 'Pokračovat →', exact: true }).click();
  await expect(dialog.locator('#booking-calendar')).toBeVisible();
  await expect(dialog.locator('#selected-slot-label')).toHaveText('Termín zatím není vybraný.');
  await expect(dialog.locator('[name="marketing"]')).not.toBeChecked();
  await expect(dialog.locator('[name="terms"]')).not.toBeChecked();
});
test('Five-step journey reveals the selected detail', async ({ page }) => {
  await page.goto('/');
  const finalStep = page.getByRole('button', { name: /05 Závěrečná zkouška/ });
  await finalStep.click();
  await expect(finalStep).toHaveAttribute('aria-pressed', 'true');
  await expect(finalStep).toHaveAttribute('aria-expanded', 'true');
  await expect(page.locator('#road-detail-4')).toContainText('Teoretická část závěrečné zkoušky');
  await expect(page.getByRole('button', { name: /01 Online objednávka/ })).toHaveAttribute(
    'aria-pressed',
    'false',
  );
});
test('Order dialog excludes moto and limits Kladno and Statenice to B and L17', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Přihlásit se ↗', exact: true }).click();
  const dialog = page.getByRole('dialog');
  const course = dialog.getByRole('combobox', { name: 'Kurz', exact: true });
  await expect(course.locator('option[value="a1"]')).toHaveCount(0);
  await dialog.getByRole('combobox', { name: 'Pobočka', exact: true }).selectOption('kladno');
  await expect(course.locator('option[value="b-automat"]')).toHaveJSProperty('hidden', true);
  await expect(course.locator('option[value="b96"]')).toHaveJSProperty('hidden', true);
  await expect(course.locator('option[value="b"]')).toHaveJSProperty('hidden', false);
  await expect(course.locator('option[value="l17"]')).toHaveJSProperty('hidden', false);
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
