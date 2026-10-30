import { expect, test } from '@playwright/test';

test('opens the nearest month with a free appointment when the current month is full', async ({ page }) => {
  const nextMonth = new Date(new Date().getFullYear(), new Date().getMonth() + 1, 10, 14);
  const slotStart = nextMonth.toISOString();
  const slotEnd = new Date(nextMonth.getTime() + 20 * 60_000).toISOString();
  const queriedMonths: string[] = [];

  await page.route('**/api/slots?**', (route) => {
    const from = new URL(route.request().url()).searchParams.get('from')!;
    queriedMonths.push(from);
    const isNextMonth = from === `${nextMonth.getFullYear()}-${String(nextMonth.getMonth() + 1).padStart(2, '0')}-01`;
    return route.fulfill({
      json: {
        ok: true,
        slots: isNextMonth
          ? [{ id: 'test-slot', branch: 'strizkov', startsAt: slotStart, endsAt: slotEnd, remaining: 1 }]
          : [],
      },
    });
  });

  await page.goto('/kurzy');
  await page.locator('[data-order][data-course="b"]').first().click();
  const dialog = page.locator('#order-dialog');
  await dialog.locator('[name="branch"]').selectOption('strizkov');
  await dialog.locator('#order-next').click();
  await dialog.locator('[name="firstName"]').fill('Test');
  await dialog.locator('[name="lastName"]').fill('Student');
  await dialog.locator('[name="email"]').fill('test@example.com');
  await dialog.locator('[name="phone"]').fill('777123456');
  await dialog.locator('#order-next').click();

  await expect(dialog.locator('#calendar-title')).toContainText(
    new Intl.DateTimeFormat('cs-CZ', { month: 'long', year: 'numeric' }).format(nextMonth),
  );
  await expect(dialog.locator('.calendar-day.available')).toHaveCount(1);
  expect(queriedMonths).toHaveLength(2);
});
