import { test, expect } from '@playwright/test';

for (const width of [320, 390, 1280]) {
  test(`Course B price is immediately readable at ${width}px without selecting options`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 844 });
    await page.goto('/cenik');
    const overview = page.getByRole('region', { name: 'Ceny kurzů B a L17 podle pobočky' });
    const row = overview.getByRole('row').filter({ hasText: 'B · manuál' });
    const price = row.getByRole('cell').first();
    await expect(price).toHaveText('25 900 Kč');
    await expect(overview.getByRole('columnheader', { name: 'Střížkov' })).toBeInViewport({
      ratio: 1,
    });
    await expect(price).toBeInViewport({ ratio: 1 });
    const bounds = await price.boundingBox();
    const regionBounds = await overview.boundingBox();
    expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(regionBounds!.x + regionBounds!.width);
    expect(await overview.evaluate((element) => element.scrollLeft)).toBe(0);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    await expect(row.getByRole('cell').nth(1)).toHaveText('20 000 Kč');
    if (width < 760) {
      await overview.evaluate((element) => {
        element.scrollLeft = element.scrollWidth;
      });
      await expect(overview.getByRole('columnheader', { name: 'Statenice' })).toBeInViewport({
        ratio: 1,
      });
      await expect(row.getByRole('rowheader')).toBeInViewport({ ratio: 1 });
    }
  });
}
