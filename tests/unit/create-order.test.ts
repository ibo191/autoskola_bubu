import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { BookingRepository, ProvisionalInput } from '../../src/lib/booking/repository';
import { CreateOrderService, type OrderLegalSettings } from '../../src/lib/booking/create-order';
import { LocalCaptcha, LocalEmail } from '../../src/lib/integrations/local';
import { LocalRateLimiter, requestFingerprint } from '../../src/lib/security/rate-limit';
import { priceSource } from '../../src/lib/catalog';

const env = { APP_ENV: 'local' };
const now = new Date('2026-08-31T10:00:00Z');
const legal: OrderLegalSettings = {
  approved: true,
  terms: { version: 'LOCAL-TEST-ONLY-v1', wording: 'Fiktivní testovací souhlas.' },
  marketing: { version: 'LOCAL-TEST-ONLY-v1', wording: 'Fiktivní testovací marketing.' },
};
const baseBody = {
  slotId: '11111111-1111-4111-8111-111111111111',
  contact: {
    firstName: 'Fiktivní',
    lastName: 'Test',
    email: 'fixture@example.invalid',
    phone: '+420000000000',
  },
  selection: { course: 'b', branch: 'strizkov', transmission: 'manual' },
  captchaToken: 'replaced-in-test-000000',
  priceVersion: priceSource.version,
  termsAccepted: true,
  privacyAccepted: true,
  marketingAccepted: false,
} as const;

class FakeRepository implements BookingRepository {
  calls: ProvisionalInput[] = [];
  shouldFail = false;
  async listAvailableSlots() {
    return [];
  }
  async createProvisional(input: ProvisionalInput) {
    if (this.shouldFail) throw new Error('synthetic failure');
    this.calls.push(input);
    return {
      orderId: '22222222-2222-4222-8222-222222222222',
      publicCode: 'BUBU-TEST1234',
      appointmentId: '33333333-3333-4333-8333-333333333333',
      expiresAt: '2026-08-31T10:15:00.000Z',
      startsAt: '2026-08-31T10:00:00.000Z',
      endsAt: '2026-08-31T10:10:00.000Z',
    };
  }
  async verifyEmail() {
    return { ok: false };
  }
  async getPublicOrder() {
    return null;
  }
  async rescheduleAppointment() {
    return { ok: false as const };
  }
  async cancelAppointment() {
    return { ok: false };
  }
  async adminSummary() {
    return { ordersTotal: 0, ordersConfirmed: 0, appointmentsTotal: 0, byCourse: [], byDay: [] };
  }
}

function fixture(overrides: Partial<{ legal: OrderLegalSettings }> = {}) {
  const repository = new FakeRepository();
  const captcha = new LocalCaptcha(env);
  const email = new LocalEmail(env);
  const rateLimiter = new LocalRateLimiter();
  const service = new CreateOrderService({
    repository,
    captcha,
    email,
    rateLimiter,
    legal: overrides.legal ?? legal,
    origin: 'http://127.0.0.1:4321',
    notificationEmail: 'orders@example.invalid',
  });
  const execute = (body: unknown = baseBody, at = now) =>
    service.execute({ body, hostname: '127.0.0.1', clientFingerprint: 'hashed-client', now: at });
  return { repository, captcha, email, rateLimiter, service, execute };
}

test('order workflow fails closed while legal texts are not approved', async () => {
  const f = fixture({ legal: { ...legal, approved: false } });
  assert.deepEqual(await f.execute(), { ok: false, code: 'ORDERS_DISABLED' });
  assert.equal(f.repository.calls.length, 0);
});

test('order workflow recalculates price, stores a hash, then sends customer and internal order messages', async () => {
  const f = fixture();
  const captchaToken = f.captcha.issue('create_order', now);
  const result = await f.execute({ ...baseBody, captchaToken });
  assert.equal(result.ok, true);
  assert.equal(f.repository.calls.length, 1);
  assert.equal(f.repository.calls[0]?.price.amount, 24900);
  assert.match(f.repository.calls[0]?.verificationHash ?? '', /^[a-f0-9]{64}$/);
  assert.equal(f.repository.calls[0]?.terms.accepted, true);
  assert.equal(f.repository.calls[0]?.marketing.accepted, false);
  assert.equal(f.email.messages.size, 2);
  const customer = [...f.email.messages.values()].find(
    (item) => item.to === 'fixture@example.invalid',
  );
  const internal = [...f.email.messages.values()].find(
    (item) => item.to === 'orders@example.invalid',
  );
  assert.ok(customer);
  assert.ok(internal);
  assert.equal(internal.replyTo, 'fixture@example.invalid');
  const message = customer;
  assert.match(message?.text ?? '', /BUBU-TEST1234/);
  assert.match(message?.text ?? '', /\/dekujeme\?kod=BUBU-TEST1234/);
  assert.match(message?.text ?? '', /\/spravovat-termin\?kod=BUBU-TEST1234/);
  assert.doesNotMatch(
    message?.text ?? '',
    new RegExp(f.repository.calls[0]?.verificationHash ?? 'x'),
  );
});

test('client price fields and stale price versions are rejected', async () => {
  const f = fixture();
  let token = f.captcha.issue('create_order', now);
  assert.deepEqual(await f.execute({ ...baseBody, captchaToken: token, amount: 1 }), {
    ok: false,
    code: 'INVALID_REQUEST',
  });
  token = f.captcha.issue('create_order', now);
  assert.deepEqual(await f.execute({ ...baseBody, captchaToken: token, priceVersion: 'old' }), {
    ok: false,
    code: 'QUOTE_CHANGED',
  });
  assert.equal(f.repository.calls.length, 0);
});

test('invalid contact, honeypot and failed captcha never reach storage', async () => {
  const f = fixture();
  assert.equal(
    (await f.execute({ ...baseBody, contact: { ...baseBody.contact, website: 'bot' } })).ok,
    false,
  );
  assert.deepEqual(await f.execute(), { ok: false, code: 'CAPTCHA_FAILED' });
  assert.equal(f.repository.calls.length, 0);
});

test('storage failure sends no verification message', async () => {
  const f = fixture();
  f.repository.shouldFail = true;
  const captchaToken = f.captcha.issue('create_order', now);
  assert.deepEqual(await f.execute({ ...baseBody, captchaToken }), {
    ok: false,
    code: 'STORAGE_FAILED',
  });
  assert.equal(f.email.messages.size, 0);
});

test('sixth order attempt in ten minutes is rate limited', async () => {
  const f = fixture();
  for (let attempt = 0; attempt < 5; attempt += 1) await f.execute();
  assert.deepEqual(await f.execute(), {
    ok: false,
    code: 'RATE_LIMITED',
    retryAfterSeconds: 600,
  });
});

test('request fingerprints use a keyed hash and never expose the identifier', () => {
  const identifier = '192.0.2.10';
  const fingerprint = requestFingerprint(identifier, 'local-test-secret-with-at-least-32-chars');
  assert.match(fingerprint, /^[a-f0-9]{64}$/);
  assert.doesNotMatch(fingerprint, new RegExp(identifier.replaceAll('.', '\\.')));
  assert.throws(() => requestFingerprint(identifier, 'short'));
});
