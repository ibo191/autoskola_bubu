import { test, expect } from '@playwright/test';

test.use({ viewport: { width: 390, height: 844 } });

test('private exam hub supports direct mobile access, search and a validated question', async ({
  page,
  request,
}) => {
  const response = await page.goto('/zkousky');
  expect(response?.status()).toBe(200);
  expect(response?.headers()['x-robots-tag']).toBe('noindex, nofollow');
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', 'noindex, nofollow');
  await expect(page.getByRole('heading', { name: 'Vše ke zkoušce na jednom místě' })).toBeVisible();
  await expect(page.locator('header a[href="/zkousky"], footer a[href="/zkousky"]')).toHaveCount(0);
  expect(await (await request.get('/sitemap-0.xml')).text()).not.toContain('/zkousky');

  const search = page.getByRole('searchbox', { name: 'Hledat v častých otázkách' });
  await search.fill('opravna zkouska');
  await expect(page.locator('[data-exam-id]:visible')).not.toHaveCount(0);
  const question = page.locator('[data-exam-id="exam-22"] summary');
  await question.click();
  await expect(question).toHaveAttribute('aria-expanded', 'true');
  await expect(page.locator('[data-exam-id="exam-22"] .exam-answer')).toContainText('800 Kč');

  await page.getByRole('button', { name: 'Co s sebou' }).click();
  await expect(search).toHaveValue('Co s sebou');
  await search.fill('nenaleznutelnydotaz');
  await expect(page.getByText('Nenašli jsme odpověď na váš dotaz.')).toBeVisible();
  await page.getByRole('link', { name: 'Položit dotaz' }).click();
  await expect(page).toHaveURL(/#exam-form$/);

  const form = page.locator('[data-exam-form]');
  await form.getByRole('button', { name: 'Odeslat dotaz' }).click();
  expect(
    await form
      .locator('[name="firstName"]')
      .evaluate((input: HTMLInputElement) => input.validity.valueMissing),
  ).toBe(true);
  await form.locator('[name="firstName"]').fill('Jan');
  await form.locator('[name="lastName"]').fill('Novák');
  await form.locator('[name="email"]').fill('bad-address');
  await form.locator('[name="phone"]').fill('725 717 755');
  await form.locator('[name="branch"]').selectOption('strizkov');
  await form.locator('[name="message"]').fill('Prosím o informace k termínu zkoušky.');
  await form.getByRole('button', { name: 'Odeslat dotaz' }).click();
  expect(
    await form
      .locator('[name="email"]')
      .evaluate((input: HTMLInputElement) => input.validity.typeMismatch),
  ).toBe(true);

  await form.locator('[name="email"]').fill('jan@example.cz');
  await page.evaluate(() => {
    document.body.dataset.recaptchaSiteKey = 'test-site-key';
  });
  await page.route('https://www.google.com/recaptcha/api.js?**', (route) =>
    route.fulfill({
      contentType: 'application/javascript',
      body: 'window.grecaptcha={ready:(callback)=>callback(),execute:()=>Promise.resolve("test-token")};',
    }),
  );
  let submitted = 0;
  await page.route('**/api/exam-question', async (route) => {
    submitted += 1;
    expect(route.request().postDataJSON()).toMatchObject({
      firstName: 'Jan',
      branch: 'strizkov',
      recaptchaToken: 'test-token',
    });
    await route.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true}' });
  });
  await form.getByRole('button', { name: 'Odeslat dotaz' }).click();
  await expect(form).toBeHidden();
  await expect(page.getByRole('heading', { name: /Dotaz jsme přijali/ })).toBeVisible();
  expect(submitted).toBe(1);
  const horizontalOverflow = await page.evaluate(
    () => document.documentElement.scrollWidth > window.innerWidth,
  );
  expect(horizontalOverflow).toBe(false);
});
