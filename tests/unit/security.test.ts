import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PRODUCTION_PUBLIC_ORIGIN, publicAppOrigin, readConfig } from '../../src/lib/config';
import { LocalCaptcha, LocalEmail, NoopAnalytics } from '../../src/lib/integrations/local';
import { createToken, tokenMatches } from '../../src/lib/security/tokens';
import { contactSchema } from '../../src/lib/validation/contact';
import { verifyRecaptcha } from '../../src/lib/server/recaptcha';
test('Stage A rejects production, cloud DB and non-local origin', () => {
  assert.throws(() => readConfig({ APP_ENV: 'production' }));
  assert.throws(() => readConfig({ APP_ORIGIN: 'https://example.com' }));
  assert.throws(() => readConfig({ SUPABASE_URL: 'https://example.supabase.co' }));
  for (const Adapter of [LocalCaptcha, LocalEmail, NoopAnalytics])
    assert.throws(() => new Adapter({ APP_ENV: 'production' }));
});
test('Vercel preview forces safe stage A adapters', () => {
  const config = readConfig({
    VERCEL: '1',
    VERCEL_URL: 'autoskola-bubu.vercel.app',
    APP_ENV: 'production',
    RECAPTCHA_ADAPTER: 'recaptcha',
    EMAIL_ADAPTER: 'smtp',
    ANALYTICS_ADAPTER: 'gtm',
  });
  assert.equal(config.APP_ENV, 'preview');
  assert.equal(config.APP_ORIGIN, 'https://autoskola-bubu.vercel.app');
  assert.equal(config.RECAPTCHA_ADAPTER, 'local');
  assert.equal(config.EMAIL_ADAPTER, 'local');
  assert.equal(config.ANALYTICS_ADAPTER, 'noop');
  assert.doesNotThrow(() =>
    readConfig({
      VERCEL: '1',
      VERCEL_URL: 'autoskola-bubu.vercel.app',
      SUPABASE_URL: 'https://example.supabase.co',
    }),
  );
  assert.equal(
    readConfig({
      VERCEL: '1',
      VERCEL_PROJECT_PRODUCTION_URL: 'autoskola-bubu.vercel.app',
    }).APP_ORIGIN,
    'https://autoskola-bubu.vercel.app',
  );
});
test('Vercel production fails closed until required integrations are configured', () => {
  const base = {
    VERCEL: '1',
    VERCEL_ENV: 'production',
    VERCEL_PROJECT_PRODUCTION_URL: 'www.autoskolabubu.cz',
    APP_ORIGIN: 'https://www.autoskolabubu.cz',
  };
  assert.throws(() => readConfig(base), /Missing required production environment variables/);
  const config = readConfig({
    ...base,
    SUPABASE_URL: 'https://example.supabase.co',
    SUPABASE_SERVICE_ROLE_KEY: 'service-role-key',
    RATE_LIMIT_SECRET: 'rate-limit-secret',
    LETTERMINT_PROJECT_TOKEN: 'lettermint-token',
    ORDER_NOTIFICATION_EMAIL: 'objednavky@autoskolabubu.cz',
    CRON_SECRET: 'cron-secret',
    RECAPTCHA_SECRET_KEY: 'recaptcha-secret',
    PUBLIC_RECAPTCHA_SITE_KEY: 'recaptcha-site-key',
  });
  assert.equal(config.APP_ENV, 'production');
  assert.equal(config.APP_ORIGIN, 'https://www.autoskolabubu.cz');
  assert.equal(config.RECAPTCHA_ADAPTER, 'recaptcha');
  assert.equal(config.EMAIL_ADAPTER, 'lettermint');
  assert.equal(config.ANALYTICS_ADAPTER, 'google-meta');
  assert.equal(
    publicAppOrigin({
      ...base,
      APP_ORIGIN: 'https://autoskola-bubu.vercel.app',
      SUPABASE_URL: 'https://example.supabase.co',
      SUPABASE_SERVICE_ROLE_KEY: 'service-role-key',
      RATE_LIMIT_SECRET: 'rate-limit-secret',
      LETTERMINT_PROJECT_TOKEN: 'lettermint-token',
      ORDER_NOTIFICATION_EMAIL: 'objednavky@autoskolabubu.cz',
      CRON_SECRET: 'cron-secret',
    }),
    PRODUCTION_PUBLIC_ORIGIN,
  );
  const withoutRecaptcha = readConfig({
    ...base,
    SUPABASE_URL: 'https://example.supabase.co',
    SUPABASE_SERVICE_ROLE_KEY: 'service-role-key',
    RATE_LIMIT_SECRET: 'rate-limit-secret',
    LETTERMINT_PROJECT_TOKEN: 'lettermint-token',
    ORDER_NOTIFICATION_EMAIL: 'objednavky@autoskolabubu.cz',
    CRON_SECRET: 'cron-secret',
  });
  assert.equal(withoutRecaptcha.RECAPTCHA_ADAPTER, 'recaptcha');
});
test('Captcha is single-use, action-bound, host-bound and expires', async () => {
  const captcha = new LocalCaptcha({ APP_ENV: 'local' });
  const now = new Date('2026-08-31T10:00:00Z');
  const token = captcha.issue('order', now);
  assert.equal(await captcha.verify({ token, action: 'order', hostname: '127.0.0.1', now }), true);
  assert.equal(await captcha.verify({ token, action: 'order', hostname: '127.0.0.1', now }), false);
  assert.equal(
    await captcha.verify({
      token: captcha.issue('order', now),
      action: 'contact',
      hostname: '127.0.0.1',
      now,
    }),
    false,
  );
  assert.equal(
    await captcha.verify({
      token: captcha.issue('order', now),
      action: 'order',
      hostname: 'example.com',
      now,
    }),
    false,
  );
  assert.equal(
    await captcha.verify({
      token: captcha.issue('order', now),
      action: 'order',
      hostname: '127.0.0.1',
      now: new Date(now.getTime() + 120000),
    }),
    false,
  );
});
test('server reCAPTCHA verification requires success, expected action and a score of at least 0.5', async () => {
  const env = { RECAPTCHA_SECRET_KEY: 'server-only-test-secret' };
  const valid = await verifyRecaptcha('valid-token', 'order', {
    env,
    hostname: 'www.autoskolabubu.cz',
    fetcher: async () =>
      Response.json({
        success: true,
        action: 'order',
        score: 0.7,
        hostname: 'www.autoskolabubu.cz',
      }),
  });
  assert.equal(valid, true);
  const wrongAction = await verifyRecaptcha('valid-token', 'order', {
    env,
    fetcher: async () => Response.json({ success: true, action: 'contact', score: 0.9 }),
  });
  assert.equal(wrongAction, false);
  const lowScore = await verifyRecaptcha('valid-token', 'order', {
    env,
    fetcher: async () => Response.json({ success: true, action: 'order', score: 0.49 }),
  });
  assert.equal(lowScore, false);
});
test('server reCAPTCHA verification fails closed when its secret is unavailable', async () => {
  assert.equal(await verifyRecaptcha('token', 'order', { env: {} }), false);
});
test('Local email adapter deduplicates; performs no network I/O', async () => {
  const email = new LocalEmail({ APP_ENV: 'local' });
  const message = {
    idempotencyKey: 'test-1',
    to: 'fixture@example.invalid',
    subject: 'Fiktivní test',
    text: 'Pouze test',
  };
  await email.send(message);
  await email.send(message);
  assert.equal(email.messages.size, 1);
});
test('Tokens are unpredictable, hashed, timing-safe and reject malformed hashes', () => {
  const a = createToken(),
    b = createToken();
  assert.notEqual(a.token, b.token);
  assert.notEqual(a.token, a.hash);
  assert.equal(tokenMatches(a.token, a.hash), true);
  assert.equal(tokenMatches(b.token, a.hash), false);
  assert.equal(tokenMatches(a.token, 'x'), false);
});
test('Contact schema normalizes and rejects extra PII and honeypot', () => {
  const data = {
    firstName: ' Fiktivní ',
    lastName: 'Test',
    email: 'FIXTURE@example.invalid',
    phone: '+420 000 000 000',
  };
  const parsed = contactSchema.parse(data);
  assert.equal(parsed.firstName, 'Fiktivní');
  assert.equal(parsed.email, 'fixture@example.invalid');
  assert.equal(parsed.phone, '+420000000000');
  assert.equal(contactSchema.safeParse({ ...data, birthNumber: '123' }).success, false);
  assert.equal(contactSchema.safeParse({ ...data, website: 'spam' }).success, false);
});
