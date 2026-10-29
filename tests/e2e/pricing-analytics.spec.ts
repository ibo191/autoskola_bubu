import { test, expect } from '@playwright/test';

const cookie = (analytics: boolean) => ({
  name: 'bubu_cookie_consent',
  value: encodeURIComponent(
    JSON.stringify({ version: 1, necessary: true, analytics, marketing: false }),
  ),
  domain: '127.0.0.1',
  path: '/',
});

test('price configurator events follow analytics consent and do not duplicate completion', async ({
  page,
}) => {
  await page.route(/googletagmanager\.com/, (route) =>
    route.fulfill({ status: 200, contentType: 'text/javascript', body: '' }),
  );
  await page.context().addCookies([cookie(false)]);
  await page.goto('/cenik');
  test.skip(
    !(await page.locator('body').getAttribute('data-google-tag-id')),
    'Requires PUBLIC_GOOGLE_TAG_ID at build time',
  );
  await page.locator('[data-category="auto"]').click();
  expect(await page.evaluate(() => window.dataLayer)).toBeUndefined();

  await page.context().addCookies([cookie(true)]);
  await page.reload();
  await page.locator('[data-category="auto"]').click();
  await page.locator('#branch-question [data-branch="strizkov"]').click();
  await page.locator('#transmission-question [data-transmission="manual"]').click();
  await page.locator('[data-mode="standard"]').click();
  await expect(page.locator('#pricing-results')).toBeVisible();
  await page.locator('#wizard-path button').filter({ hasText: 'Varianta' }).click();
  await page.locator('[data-mode="standard"]').click();
  await expect(page.locator('#pricing-results')).toBeVisible();
  await page.locator('.offer-card [data-order]').click();
  const events = await page.evaluate(() =>
    (window.dataLayer ?? [])
      .filter(
        (entry): entry is IArguments =>
          Object.prototype.toString.call(entry) === '[object Arguments]',
      )
      .map((entry) => [entry[0], entry[1]]),
  );
  for (const event of [
    'course_config_start',
    'course_type_selected',
    'course_location_selected',
    'course_transmission_selected',
    'course_config_completed',
    'course_registration_click',
  ])
    expect(events.filter((entry) => entry[0] === 'event' && entry[1] === event)).toHaveLength(1);
  expect(
    events.filter((entry) => entry[0] === 'event' && entry[1] === 'generate_lead'),
  ).toHaveLength(0);
});
