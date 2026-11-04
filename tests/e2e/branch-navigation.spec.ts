import { test, expect } from '@playwright/test';

for (const viewport of [
  { width: 1280, height: 900 },
  { width: 390, height: 844 },
]) {
  test.describe(`Branch navigation at ${viewport.width}px`, () => {
    test.use({ viewport });

    for (const branch of ['kladno', 'strizkov', 'statenice']) {
      test(`${branch} section links have unique targets and the hero leads to the promised content`, async ({
        page,
      }) => {
        await page.goto(`/${branch}`);

        const anchors = await page.locator('main a[href^="#"]').evaluateAll((links) =>
          links.map((link) => {
            const hash = link.getAttribute('href')!;
            const targets = [...document.querySelectorAll('[id]')].filter(
              (element) => element.id === decodeURIComponent(hash.slice(1)),
            );
            return { hash, count: targets.length };
          }),
        );
        for (const anchor of anchors) expect(anchor.count, anchor.hash).toBe(1);

        const heroLink = page.locator('.page-hero a.btn.secondary');
        if (branch === 'strizkov') {
          await expect(heroLink).toHaveAttribute('href', /^tel:/);
          await expect(page.locator('#pobocka')).toContainText('U Kapliček 34');
          return;
        }

        const targetId = branch === 'kladno' ? 'teorie' : 'vycvik';
        await expect(heroLink).toHaveAttribute('href', `#${targetId}`);
        await heroLink.click();
        await expect(page).toHaveURL(new RegExp(`#${targetId}$`));
        const target = page.locator(`#${targetId}`);
        await expect(target.getByRole('heading', { level: 2 })).toBeInViewport();
        if (branch === 'kladno') {
          await expect(target).toContainText('Cyrila Boudy 2954');
          await expect(target).toContainText('Havířská 1141');
        }
      });
    }
  });
}
