import { test, expect } from '@playwright/test';

const cases = [
  { path: '/', width: 320, height: 568 },
  { path: '/strizkov', width: 320, height: 568 },
  ...['/', '/cenik', '/kladno', '/strizkov', '/statenice', '/kurzy/ridicak-skupina-b'].map(
    (path) => ({
      path,
      width: 390,
      height: 844,
    }),
  ),
];

for (const { path, width, height } of cases) {
  test.describe(`${path} at ${width}px`, () => {
    test.use({ viewport: { width, height }, isMobile: true, hasTouch: true });

    test('mobile menu enrollment remains interactive through closing and reopening', async ({
      page,
    }) => {
      const errors: string[] = [];
      page.on('pageerror', (error) => errors.push(error.message));
      await page.goto(path);
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= document.documentElement.clientWidth,
        ),
      ).toBe(true);
      // Start with the cookie banner still present, as for a first-time visitor.
      const menu = page.getByRole('button', { name: 'Menu', exact: true });
      await menu.tap();
      const navigation = page.getByRole('navigation', { name: 'Hlavní navigace' });
      await navigation.getByRole('button', { name: 'Přihlásit se ↗', exact: true }).tap();
      const dialog = page.locator('#order-dialog');
      await expect(dialog).toBeVisible();
      await dialog.getByRole('button', { name: 'Zavřít objednávku' }).tap();
      await expect(dialog).toBeHidden();
      await expect(page.locator('body')).not.toHaveClass(/dialog-open/);
      await navigation.getByRole('button', { name: 'Přihlásit se ↗', exact: true }).tap();

      await dialog.getByRole('combobox', { name: 'Pobočka', exact: true }).selectOption('kladno');
      await dialog.getByRole('combobox', { name: 'Kurz', exact: true }).selectOption('b');
      await expect(dialog.locator('#quote-amount')).toHaveText('20 000 Kč');
      await dialog.getByRole('button', { name: 'Pokračovat →', exact: true }).tap();
      await dialog.getByLabel('Jméno', { exact: true }).fill('Test');
      await dialog.getByLabel('Příjmení', { exact: true }).fill('Mobil');
      await dialog.getByLabel('E-mail', { exact: true }).fill('mobile@example.invalid');
      await dialog.getByLabel('Telefon', { exact: true }).fill('777123456');
      await dialog.getByRole('button', { name: 'Pokračovat →', exact: true }).tap();
      await expect(dialog.locator('#order-summary')).toContainText('Přihlášení online');
      await dialog.locator('[name="terms"]').check();
      await dialog.locator('[name="marketing"]').check();
      await expect(dialog.locator('[name="terms"]')).toBeChecked();
      await dialog
        .getByRole('button', { name: 'Odeslat objednávku', exact: true })
        .click({ trial: true });
      await dialog.getByRole('button', { name: 'Zpět', exact: true }).tap();
      await expect(dialog.getByLabel('Jméno', { exact: true })).toHaveValue('Test');

      await dialog.getByRole('button', { name: 'Zavřít objednávku' }).tap();
      await dialog.getByRole('button', { name: 'Pokračovat ve výběru' }).tap();
      await expect(dialog.locator('#discard-question')).toBeHidden();
      await dialog.getByRole('button', { name: 'Zavřít objednávku' }).tap();
      await dialog.getByRole('button', { name: 'Zahodit a zavřít' }).tap();
      await expect(dialog).toBeHidden();
      await expect(page.locator('body')).not.toHaveClass(/dialog-open/);

      await page.getByRole('button', { name: 'Jen nezbytné', exact: true }).tap();
      await page.evaluate(() => window.scrollTo(0, 0));
      await menu.tap();
      await expect(menu).toHaveAttribute('aria-expanded', 'false');
      await menu.tap();
      for (const link of await navigation.getByRole('link').all()) {
        await link.click({ trial: true });
      }
      const link = navigation.getByRole('link').first();
      const href = await link.getAttribute('href');
      await link.tap();
      await expect(page).toHaveURL(new RegExp(`${href}/?$`));
      expect(errors).toEqual([]);
    });
  });
}
