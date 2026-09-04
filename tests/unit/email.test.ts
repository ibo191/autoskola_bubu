import { test } from 'node:test';
import assert from 'node:assert/strict';
import { contactFormEmail, internalNewOrderEmail } from '../../src/lib/server/email/templates';
import {
  addDaysToLocalDate,
  eventKey,
  stripHeader,
  toPragueDate,
} from '../../src/lib/server/email/utils';
import { assertCronAuthorized } from '../../src/lib/server/email/workflows';

const contact = {
  firstName: 'Jan',
  lastName: 'Novák',
  email: 'jan@example.invalid',
  phone: '+420777111222',
  website: '',
} as const;

const orderInput = {
  orderId: '22222222-2222-4222-8222-222222222222',
  publicCode: 'BUBU-TEST1234',
  contact,
  selection: {
    course: 'b' as const,
    branch: 'strizkov' as const,
    transmission: 'manual' as const,
    package: 'single' as const,
    heldLicences: [],
    addons: { book: false, hoodieQty: 0, shirtQty: 0 },
  },
  price: {
    ok: true as const,
    amount: 24900,
    baseAmount: 24900,
    addonsAmount: 0,
    addons: [],
    currency: 'CZK' as const,
    package: 'single' as const,
    training: 'standard' as const,
    extraTheoryHours: 0,
    schoolFee: 1000,
    authorityFee: 700,
    priceVersion: 'test',
  },
  addons: [],
  appointment: {
    id: '33333333-3333-4333-8333-333333333333',
    startsAt: '2026-09-04T13:00:00.000Z',
    endsAt: '2026-09-04T13:20:00.000Z',
  },
  createdAt: new Date('2026-09-01T10:00:00.000Z'),
  thankYouUrl: 'https://example.invalid/dekujeme?kod=BUBU-TEST1234',
  manageUrl: 'https://example.invalid/spravovat-termin?kod=BUBU-TEST1234',
  notificationEmail: 'orders@example.invalid',
};

test('header fields are sanitized before provider payload is created', () => {
  assert.equal(
    stripHeader('Hello\r\nBcc: attacker@example.com'),
    'Hello Bcc: attacker@example.com',
  );
});

test('contact form notification replies to the customer, not to the system mailbox', () => {
  const email = contactFormEmail({
    to: 'info@autoskolabubu.cz',
    source: 'contact-page',
    name: 'Jan Novák',
    email: 'jan@example.invalid',
    message: 'Prosím o informace ke kurzu.',
  });
  assert.equal(email.to, 'info@autoskolabubu.cz');
  assert.equal(email.replyTo, 'jan@example.invalid');
  assert.equal(email.eventType, 'contact_form_notification');
});

test('internal order notification replies directly to the customer', () => {
  const email = internalNewOrderEmail(orderInput);
  assert.ok(email);
  assert.equal(email.to, 'orders@example.invalid');
  assert.equal(email.replyTo, 'jan@example.invalid');
  assert.equal(email.eventType, 'internal_new_order');
});

test('idempotency keys are stable and unique by logical event', () => {
  assert.equal(
    eventKey('order-confirmation', 'order-1'),
    eventKey('order-confirmation', 'order-1'),
  );
  assert.notEqual(
    eventKey('order-confirmation', 'order-1'),
    eventKey('order-confirmation', 'order-2'),
  );
});

test('Prague local date helpers handle calendar day arithmetic for reminders', () => {
  assert.equal(toPragueDate(new Date('2026-03-28T23:30:00.000Z')), '2026-03-29');
  assert.equal(addDaysToLocalDate('2026-09-01', 3), '2026-09-04');
  assert.equal(addDaysToLocalDate('2026-09-01', 7), '2026-09-08');
  assert.equal(addDaysToLocalDate('2026-09-01', 14), '2026-09-15');
});

test('cron endpoints require the configured bearer secret', () => {
  const good = new Request('https://example.invalid/api/cron/email-reminders', {
    headers: { authorization: 'Bearer abc123' },
  });
  const bad = new Request('https://example.invalid/api/cron/email-reminders');
  assert.equal(assertCronAuthorized(good, { CRON_SECRET: 'abc123' }), true);
  assert.equal(assertCronAuthorized(bad, { CRON_SECRET: 'abc123' }), false);
  assert.equal(assertCronAuthorized(good, {}), false);
});
