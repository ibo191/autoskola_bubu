import assert from 'node:assert/strict';
import test from 'node:test';
import type { APIContext } from 'astro';
import { CampaignRequestRepository } from '../../src/lib/campaigns/requests';
import { POST } from '../../src/pages/api/campaign-requests';

test('Christmas reservations save the pickup deposit, fixed bonus and recoverable voucher number', async (t) => {
  const originalEnv = process.env;
  process.env = {
    ...originalEnv,
    SUPABASE_URL: 'https://database.example.invalid',
    SUPABASE_SERVICE_ROLE_KEY: 'test-service-key',
    RECAPTCHA_SECRET_KEY: 'test-captcha-key',
    LETTERMINT_PROJECT_TOKEN: '',
  };
  t.after(() => {
    process.env = originalEnv;
  });

  const origin = 'https://www.autoskolabubu.cz';
  const inserts: Array<{ id: string }> = [];
  t.mock.method(globalThis, 'fetch', async (url: string | URL, options: RequestInit) => {
    if (url === 'https://www.google.com/recaptcha/api/siteverify')
      return Response.json({
        success: true,
        score: 0.9,
        action: 'campaign_request',
        hostname: 'www.autoskolabubu.cz',
      });

    const requestUrl = new URL(url);
    assert.equal(
      requestUrl.origin + requestUrl.pathname,
      'https://database.example.invalid/rest/v1/campaign_requests',
    );
    const created_at = '2026-11-10T12:00:00Z';
    if (options.method !== 'POST') {
      assert.equal(requestUrl.searchParams.get('campaign_id'), 'eq.vanoce');
      return Response.json(inserts.map((row) => ({ ...row, created_at })));
    }
    const row = JSON.parse(String(options.body));
    inserts.push(row);
    return Response.json([{ id: row.id, created_at }]);
  });

  const submit = (selection: Record<string, string | undefined>) =>
    POST({
      request: new Request(origin + '/api/campaign-requests', {
        method: 'POST',
        headers: { origin, 'content-type': 'application/json' },
        body: JSON.stringify({
          campaignId: 'vanoce',
          contact: { firstName: 'Test', email: 'test@example.invalid', phone: '+420777000000' },
          selection,
          payload: {
            recipientFirstName: 'Test',
            delivery: { street: 'Test' },
            paymentMethod: 'wire',
            voucherNumber: 'client-generated',
          },
          termsAccepted: true,
          recaptchaToken: 'test-token',
        }),
      }),
    } as APIContext);

  for (const selection of [
    {},
    { branch: 'statenice' },
    { branch: 'kladno', deliveryMethod: 'shipping' },
  ]) {
    assert.equal((await submit(selection)).status, 422);
  }
  assert.equal(inserts.length, 0);

  const response = await submit({
    branch: 'kladno',
    course: 'b',
    bonusVariant: 'mock-exam-plus-ride',
  });
  assert.equal(response.status, 200);
  const result = await response.json();
  assert.equal(inserts.length, 1);
  const [saved] = inserts;
  assert.ok(saved);
  assert.equal(result.requestId, saved.id);
  assert.equal(result.voucherNumber, `BUBU-${saved.id.toUpperCase()}`);
  assert.partialDeepStrictEqual(saved, {
    amount_due_czk: 5000,
    payment_status: 'pending_offline_payment',
    selection: {
      branch: 'kladno',
      course: 'b',
      bonusVariant: 'extra-rides',
      deliveryMethod: 'branch-pickup',
    },
    payload: {
      paymentMethod: 'at-pickup',
      voucherNumber: result.voucherNumber,
      bonus: { lessons: 2, minutesPerLesson: 45 },
    },
  });
  assert.doesNotMatch(JSON.stringify(saved), /client-generated|"delivery":/);
  const [voucher] = await new CampaignRequestRepository(process.env).listChristmasVouchers();
  assert.ok(voucher);
  assert.equal(voucher.voucherNumber, result.voucherNumber);
  assert.equal(voucher.recipient, 'Test');
  assert.equal(voucher.contact.email, 'test@example.invalid');
});
