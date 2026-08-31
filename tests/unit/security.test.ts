import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readConfig } from '../../src/lib/config';
import { LocalCaptcha, LocalEmail, NoopAnalytics } from '../../src/lib/integrations/local';
import { createToken, tokenMatches } from '../../src/lib/security/tokens';
import { contactSchema } from '../../src/lib/validation/contact';
test('Stage A rejects production, cloud DB and non-local origin', () => {
  assert.throws(() => readConfig({ APP_ENV: 'production' }));
  assert.throws(() => readConfig({ APP_ORIGIN: 'https://example.com' }));
  assert.throws(() => readConfig({ SUPABASE_URL: 'https://example.supabase.co' }));
  for (const Adapter of [LocalCaptcha, LocalEmail, NoopAnalytics])
    assert.throws(() => new Adapter({ APP_ENV: 'production' }));
});
test('Captcha is single-use, action-bound, host-bound and expires', async () => {
  const captcha = new LocalCaptcha({ APP_ENV: 'local' });
  const now = new Date('2026-08-31T10:00:00Z');
  const token = captcha.issue('create_order', now);
  assert.equal(
    await captcha.verify({ token, action: 'create_order', hostname: '127.0.0.1', now }),
    true,
  );
  assert.equal(
    await captcha.verify({ token, action: 'create_order', hostname: '127.0.0.1', now }),
    false,
  );
  assert.equal(
    await captcha.verify({
      token: captcha.issue('create_order', now),
      action: 'verify_email',
      hostname: '127.0.0.1',
      now,
    }),
    false,
  );
  assert.equal(
    await captcha.verify({
      token: captcha.issue('create_order', now),
      action: 'create_order',
      hostname: 'example.com',
      now,
    }),
    false,
  );
  assert.equal(
    await captcha.verify({
      token: captcha.issue('create_order', now),
      action: 'create_order',
      hostname: '127.0.0.1',
      now: new Date(now.getTime() + 120000),
    }),
    false,
  );
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
