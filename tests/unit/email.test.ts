import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  contactFormEmail,
  internalNewOrderEmail,
  orderConfirmationEmail,
  reportEmail,
} from '../../src/lib/server/email/templates';
import {
  addDaysToLocalDate,
  eventKey,
  stripHeader,
  toPragueDate,
} from '../../src/lib/server/email/utils';
import { assertCronAuthorized, previousPragueWeek } from '../../src/lib/server/email/workflows';
import { OrderEmailOutbox } from '../../src/lib/server/email/order-outbox';
import type { EmailAdapter, EmailMessage } from '../../src/lib/integrations/contracts';
import type { EmailEventRow, SupabaseEmailEventStore } from '../../src/lib/server/email/events';

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
  note: 'Prosím o zápis po 16. hodině.',
  selection: {
    course: 'b' as const,
    branch: 'strizkov' as const,
    transmission: 'manual' as const,
    package: 'single' as const,
    heldLicences: [],
    addons: { book: false },
  },
  price: {
    ok: true as const,
    amount: 25900,
    baseAmount: 25900,
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
  applicationFormUrl: 'https://example.invalid/dokumenty/prihlaska-k-vycviku.pdf',
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
  assert.match(email.text, /Poznámka k objednávce/);
  assert.match(email.text, /Prosím o zápis po 16\. hodině\./);
});

test('order confirmation includes the customer note', () => {
  const email = orderConfirmationEmail(orderInput);
  assert.match(email.text, /Poznámka k objednávce/);
  assert.match(email.text, /Prosím o zápis po 16\. hodině\./);
  assert.match(email.text, /Posudek nesmí být ke dni zápisu do autoškoly starší než 3 měsíce/);
  assert.match(email.text, /první splátka 8 700 Kč, druhá splátka 8 600 Kč/);
  assert.doesNotMatch(email.text, /pošlete odpovědí na tento e-mail/);
  assert.doesNotMatch(email.text, /PDF z EZKarty zaslaným e-mailem/);
  assert.match(email.html ?? '', /Prosím o zápis po 16\. hodině\./);
  assert.match(email.html ?? '', /<strong>oboustranně<\/strong>/);
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

test('Monday weekly report covers the previous Prague Monday through Sunday', () => {
  assert.deepEqual(previousPragueWeek(new Date('2026-09-28T05:00:00Z')), {
    from: '2026-09-21',
    to: '2026-09-28',
    lastDay: '2026-09-27',
  });
  assert.deepEqual(previousPragueWeek(new Date('2026-10-26T06:00:00Z')), {
    from: '2026-10-19',
    to: '2026-10-26',
    lastDay: '2026-10-25',
  });
  assert.deepEqual(previousPragueWeek(new Date('2027-01-04T06:00:00Z')), {
    from: '2026-12-28',
    to: '2027-01-04',
    lastDay: '2027-01-03',
  });
  assert.equal(previousPragueWeek(new Date('2026-09-27T05:00:00Z')), null);
});

test('weekly report has its own event type and idempotency key', () => {
  const email = reportEmail({
    to: 'reports@example.invalid',
    eventType: 'weekly_order_report',
    title: 'Týdenní report objednávek – 21. až 27. září 2026',
    reportKey: '2026-09-21',
    summary: { 'Objednávky celkem': 3 },
  });
  assert.equal(email.eventType, 'weekly_order_report');
  assert.equal(email.reportDate, '2026-09-21');
  assert.equal(email.reportMonth, undefined);
  assert.equal(email.idempotencyKey, eventKey('weekly_order_report', '2026-09-21'));
});

test('order outbox returns after queueing and later sends the original confirmation with PDF', async () => {
  const message = orderConfirmationEmail(orderInput);
  let queued: EmailMessage | undefined;
  let scheduled: Promise<unknown> | undefined;
  let providerMessage: EmailMessage | undefined;
  let releaseProvider: (() => void) | undefined;
  let providerStarted: (() => void) | undefined;
  const started = new Promise<void>((resolve) => {
    providerStarted = resolve;
  });
  let sent = false;
  const event: EmailEventRow = {
    id: '44444444-4444-4444-8444-444444444444',
    idempotency_key: message.idempotencyKey,
    status: 'pending',
    metadata: {},
  };
  const store = {
    async createPending(value: EmailMessage) {
      queued = value;
      event.metadata = value.metadata ?? {};
      return event;
    },
    async claimDue() {
      return event;
    },
    async markSent() {
      sent = true;
    },
    async markFailed() {},
    async retryLater() {},
    async listDue() {
      return [event];
    },
  } as unknown as SupabaseEmailEventStore;
  const provider: EmailAdapter = {
    async send(value) {
      providerMessage = value;
      providerStarted?.();
      await new Promise<void>((resolve) => {
        releaseProvider = resolve;
      });
      return { providerMessageId: 'provider-id', status: 'pending' };
    },
  };
  const outbox = new OrderEmailOutbox(provider, store, (task) => {
    scheduled = task;
  });

  assert.deepEqual(await outbox.send(message), { status: 'queued' });
  assert.equal(sent, false);
  assert.equal(queued?.attachments, undefined);
  assert.equal((queued?.metadata?.outboxMessage as EmailMessage).text, message.text);
  assert.ok(scheduled);
  await started;
  assert.equal(providerMessage?.attachments?.[0]?.contentType, 'application/pdf');
  assert.ok(releaseProvider);
  releaseProvider();
  await scheduled;
  assert.equal(sent, true);
});

test('order outbox retries a failed send and ignores legacy pending events without a payload', async () => {
  const message = internalNewOrderEmail(orderInput);
  assert.ok(message);
  let providerAttempts = 0;
  let retryAttempts = 0;
  let sent = false;
  const event: EmailEventRow = {
    id: '44444444-4444-4444-8444-444444444445',
    idempotency_key: message.idempotencyKey,
    status: 'pending',
    metadata: {},
  };
  const legacyEvent: EmailEventRow = {
    id: '44444444-4444-4444-8444-444444444446',
    idempotency_key: 'legacy-order-confirmation',
    status: 'pending',
    metadata: {},
  };
  const store = {
    async createPending(value: EmailMessage) {
      event.metadata = value.metadata ?? {};
      return event;
    },
    async listDue() {
      return [legacyEvent, event];
    },
    async claimDue(id: string) {
      assert.equal(id, event.id);
      return event;
    },
    async retryLater() {
      retryAttempts++;
    },
    async markSent() {
      sent = true;
    },
    async markFailed() {},
  } as unknown as SupabaseEmailEventStore;
  const provider: EmailAdapter = {
    async send() {
      providerAttempts++;
      if (providerAttempts === 1) throw new Error('Temporary provider timeout');
      return { providerMessageId: 'provider-id', status: 'accepted' };
    },
  };
  const outbox = new OrderEmailOutbox(provider, store);
  assert.deepEqual(await outbox.send(message), { status: 'queued' });
  assert.deepEqual(await outbox.drainDue(), { checked: 1, sent: 0, retry: 1, errors: 0 });
  assert.equal(retryAttempts, 1);
  assert.equal(sent, false);
  assert.deepEqual(await outbox.drainDue(), { checked: 1, sent: 1, retry: 0, errors: 0 });
  assert.equal(providerAttempts, 2);
  assert.equal(sent, true);
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
