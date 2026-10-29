import { test, expect } from '@playwright/test';

test('car variants retain course, transmission, branch and price in the order dialog', async ({
  page,
}) => {
  for (const transmission of ['manual', 'automatic'] as const) {
    for (const mode of ['standard', 'l17'] as const) {
      await page.goto('/cenik');
      await page.locator('[data-category="auto"]').click();
      await expect(page.locator('#branch-question')).toBeVisible();
      await expect(page.locator('#transmission-question')).toBeHidden();
      await page.locator('#branch-question [data-branch="strizkov"]').click();
      await page.locator(`[data-transmission="${transmission}"]`).click();
      await expect(page.locator(`#mode-question [data-mode="${mode}"] strong`)).toHaveText(
        mode === 'l17'
          ? transmission === 'automatic'
            ? 'Kurz BA-L17'
            : 'Kurz L17'
          : transmission === 'automatic'
            ? 'Kurz skupiny BA'
            : 'Kurz skupiny B',
      );
      await page.locator(`[data-mode="${mode}"]`).click();
      await expect(page.locator('#offer-price')).toHaveText('25 900 Kč');
      await expect(page.locator('#offer-summary')).toContainText('Pobočka: Střížkov');
      await expect(page.locator('#offer-summary')).toContainText(
        transmission === 'automatic' ? 'automat' : 'manuál',
      );
      await page.locator('.offer-card [data-order]').click();
      const dialog = page.getByRole('dialog');
      await expect(dialog.locator('[name="course"]')).toHaveValue(
        mode === 'l17' ? 'l17' : transmission === 'automatic' ? 'b-automat' : 'b',
      );
      await expect(dialog.locator('[name="branch"]')).toHaveValue('strizkov');
      await expect(dialog.locator('[name="transmission"]')).toHaveValue(transmission);
      await expect(dialog.locator('#quote-amount')).toHaveText('25 900 Kč');
    }
  }
});

test('changing transmission resets mode, and unavailable automatic is disabled', async ({
  page,
}) => {
  await page.goto('/cenik');
  await page.locator('[data-category="auto"]').click();
  await page.locator('#branch-question [data-branch="strizkov"]').click();
  await page.locator('#transmission-question [data-transmission="automatic"]').click();
  await page.locator('[data-mode="l17"]').click();
  await page.locator('#wizard-path button').filter({ hasText: 'Převodovka' }).click();
  await page.locator('#transmission-question [data-transmission="manual"]').click();
  await expect(page.locator('#mode-question')).toBeVisible();
  await expect(page.locator('[data-mode="l17"]')).toHaveAttribute('aria-pressed', 'false');
  await page.locator('#wizard-restart').click();
  await page.locator('[data-category="auto"]').click();
  await page.locator('#branch-question [data-branch="kladno"]').click();
  await expect(
    page.locator('#transmission-question [data-transmission="automatic"]'),
  ).toBeDisabled();
});

test('moto shows price and only preliminary interest; trailer and refresher remain available', async ({
  page,
}) => {
  await page.goto('/cenik');
  await page.locator('[data-category="moto"]').click();
  await expect(page.locator('#branch-question [data-branch="kladno"]')).toBeDisabled();
  await page.locator('#branch-question [data-branch="strizkov"]').click();
  await page.locator('[data-moto-target="a1"]').click();
  await page.locator('[data-licence-status="none"]').click();
  await expect(page.locator('#offer-price')).toHaveText('31 900 Kč');
  await expect(page.locator('#moto-interest-link')).toBeVisible();
  await expect(page.locator('.offer-card [data-order]')).toBeHidden();
  for (const trailer of ['b96', 'be']) {
    await page.locator('#wizard-restart').click();
    await page.locator('[data-category="prives"]').click();
    await page.locator('#branch-question [data-branch="strizkov"]').click();
    await expect(page.locator(`[data-trailer="${trailer}"] img`)).toHaveCount(2);
    await page.locator(`[data-trailer="${trailer}"]`).click();
    await expect(page.locator('#pricing-results')).toBeVisible();
    await expect(page.locator('.offer-card [data-order]')).toHaveAttribute('data-course', trailer);
  }
  await page.locator('#wizard-restart').click();
  await page.locator('[data-category="kondicni"]').click();
  await page.locator('#branch-question [data-branch="kladno"]').click();
  await page.locator('#transmission-question [data-transmission="manual"]').click();
  await page.locator('#pricing-driving-blocks').selectOption('2');
  await expect(page.locator('#offer-price')).toHaveText('3 200 Kč');
  await expect(page.locator('.decision-card')).not.toContainText(
    '800 Kč za 45 minut. Jezdíme vždy',
  );
});

test('mobile keeps one question visible and no horizontal overflow', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/cenik');
  await page.locator('[data-category="auto"]').click();
  await expect(page.locator('#pricing-wizard fieldset:visible')).toHaveCount(1);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});
