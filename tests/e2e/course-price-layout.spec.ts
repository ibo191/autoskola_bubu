import { test, expect } from '@playwright/test';

test('price page centers its introduction, styles editable steps, and lists every variant', async ({
  page,
}) => {
  await page.goto('/cenik');
  const hero = await page.locator('.page-hero h1').boundingBox();
  const viewport = page.viewportSize()!;
  expect(Math.abs(hero!.x + hero!.width / 2 - viewport.width / 2)).toBeLessThan(3);
  const table = page.getByRole('table');
  await expect(table.locator('tbody tr')).toHaveCount(16);
  await expect(table.getByRole('row', { name: /Skupina B manuál/ })).toContainText('20 000 Kč');
  await expect(table.getByRole('row', { name: /Skupina A1 Moto Jistota/ })).toContainText(
    '31 900 Kč',
  );
  await page.locator('[data-category="auto"]').click();
  await page.locator('#branch-question [data-branch="strizkov"]').click();
  const chip = page.locator('#wizard-path button').first();
  await expect(chip).toBeVisible();
  expect(await chip.evaluate((el) => getComputedStyle(el).borderRadius)).toBe('99px');
});

test('course overview defaults to Střížkov and follows selected branch into order', async ({
  page,
}) => {
  await page.goto('/kurzy');
  await expect(page.locator('[data-course-branch="strizkov"]')).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  const b = page.locator('.course-tile[data-course-id="b"]');
  await expect(b.locator('.tile-meta span')).toHaveText('25 900 Kč*');
  await page.locator('[data-course-branch="kladno"]').click();
  await expect(b.locator('.tile-meta span')).toHaveText('20 000 Kč*');
  await expect(b.locator('.price-branch')).toHaveText('Kladno');
  await expect(page.locator('.course-tile[data-course-id="b-automat"]')).toBeHidden();
  await b.locator('[data-order]').click();
  const dialog = page.getByRole('dialog');
  await expect(dialog.locator('[name="branch"]')).toHaveValue('kladno');
  await expect(dialog.locator('#quote-amount')).toHaveText('20 000 Kč');
  await dialog.getByRole('button', { name: 'Zavřít objednávku' }).click();
  await page.locator('[data-course-branch="strizkov"]').click();
  await expect(page.locator('.course-tile[data-course-id="a1"] .tile-meta span')).toHaveText(
    '31 900 Kč*',
  );
  await expect(page.locator('.course-tile .tile-meta span').filter({ hasText: 'od ' })).toHaveCount(
    0,
  );
});

test('motorcycle interest choices align on desktop and mobile', async ({ page }) => {
  for (const width of [1280, 390]) {
    await page.setViewportSize({ width, height: 850 });
    await page.goto('/motorky-2027?skupina=a2');
    const option = page.locator('fieldset label').filter({ hasText: 'Ještě žádné nemám' });
    const radio = option.locator('input[type="radio"]');
    const optionBox = await option.boundingBox();
    const radioBox = await radio.boundingBox();
    expect(radioBox!.width).toBeLessThan(25);
    expect(radioBox!.x - optionBox!.x).toBeLessThan(30);
    await radio.check();
    const packageOption = page.locator('[data-package-choice="moto-confidence"]');
    await expect(packageOption).toBeVisible();
    const packageBox = await packageOption.boundingBox();
    const packageRadio = await packageOption.locator('input[type="radio"]').boundingBox();
    expect(packageRadio!.x - packageBox!.x).toBeLessThan(30);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
  }
});
