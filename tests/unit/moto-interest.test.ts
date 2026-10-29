import { test } from 'node:test';
import assert from 'node:assert/strict';
import { motoInterestSchema, saveMotoInterest } from '../../src/lib/moto-interest';

const base = {
  firstName: 'Jana',
  lastName: 'Nováková',
  email: ' JANA@EXAMPLE.CZ ',
  phone: '725 123 456',
  course: 'a2',
  licenceStatus: 'yes',
  heldLicences: ['B'],
  package: 'moto-basic',
  source: 'cenik',
  notificationConsent: true,
  website: '',
};

test('preliminary interest requires explicit notification consent and normalizes contact', () => {
  const parsed = motoInterestSchema.parse(base);
  assert.equal(parsed.email, 'jana@example.cz');
  assert.equal(parsed.phone, '+420725123456');
  assert.equal(
    motoInterestSchema.safeParse({ ...base, notificationConsent: false }).success,
    false,
  );
  assert.equal(motoInterestSchema.safeParse({ ...base, website: 'spam' }).success, false);
  assert.equal(motoInterestSchema.safeParse({ ...base, course: 'b' }).success, false);
  assert.equal(motoInterestSchema.safeParse({ ...base, licenceStatus: 'none' }).success, false);
  assert.equal(motoInterestSchema.safeParse({ ...base, course: 'a1', package: 'moto-basic' }).success, false);
  assert.equal(motoInterestSchema.safeParse({ ...base, licenceStatus: 'none', heldLicences: [], package: 'moto-basic' }).success, false);
});

test('preliminary interest saves only the requested 2027 notification record', async () => {
  const originalFetch = globalThis.fetch;
  let body: Record<string, unknown> | undefined;
  globalThis.fetch = async (input, init) => {
    assert.match(String(input), /moto_interest\?on_conflict=season%2Cemail/);
    assert.equal(init?.method, 'POST');
    assert.match(String(new Headers(init?.headers).get('Prefer')), /ignore-duplicates/);
    body = JSON.parse(String(init?.body));
    return new Response(null, { status: 201 });
  };
  try {
    await saveMotoInterest(
      { SUPABASE_URL: 'https://example.supabase.co', SUPABASE_SERVICE_ROLE_KEY: 'test-only' },
      motoInterestSchema.parse(base),
      new Date('2026-10-19T10:00:00Z'),
    );
    assert.deepEqual(body, {
      season: 2027,
      name: 'Jana Nováková',
      first_name: 'Jana',
      last_name: 'Nováková',
      email: 'jana@example.cz',
      phone: '+420725123456',
      course: 'a2',
      licence_status: 'yes',
      held_licences: ['B'],
      holding_period: null,
      package: 'moto-basic',
      source: 'cenik',
      notification_consent_at: '2026-10-19T10:00:00.000Z',
      notification_consent_version: 'MOTO-2027-01',
    });
  } finally {
    globalThis.fetch = originalFetch;
  }
});
