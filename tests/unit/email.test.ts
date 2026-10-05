import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  appointmentReminderEmail,
  appointmentChangedEmail,
  appointmentDayReportEmail,
  adminEnrollmentEmail,
  noShowFollowUpEmail,
  examQuestionConfirmationEmail,
  examQuestionNotificationEmail,
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
import {
  assertCronAuthorized,
  appointmentReportBranches,
  needsBookingReminder,
  previousPragueWeek,
} from '../../src/lib/server/email/workflows';
import { OrderEmailOutbox } from '../../src/lib/server/email/order-outbox';
import type { EmailAdapter, EmailMessage } from '../../src/lib/integrations/contracts';
import { SupabaseEmailEventStore, type EmailEventRow } from '../../src/lib/server/email/events';
import { LettermintEmailAdapter } from '../../src/lib/server/email/lettermint';
import type { PublicOrderOverview } from '../../src/lib/booking/repository';
import type { AdminAppointment } from '../../src/lib/supabase/booking-repository';

test('exam question email goes centrally and replies to the student', () => {
  const internal = examQuestionNotificationEmail({
    submissionId: 'exam-test-1',
    firstName: 'Jan',
    lastName: 'Novák',
    email: 'jan@example.invalid',
    phone: '+420725717755',
    branch: 'kladno',
    message: '<Potřebuji termín>',
  });
  const confirmation = examQuestionConfirmationEmail({
    submissionId: 'exam-test-1',
    to: 'jan@example.invalid',
  });
  assert.equal(internal.to, 'zkousky@autoskolabubu.cz');
  assert.equal(internal.replyTo, 'jan@example.invalid');
  assert.match(internal.subject, /Jan Novák.*Kladno/);
  assert.match(internal.html ?? '', /&lt;Potřebuji termín&gt;/);
  assert.equal(confirmation.to, 'jan@example.invalid');
  assert.equal(confirmation.eventType, 'exam_question_confirmation');
});

test('appointment day reports use the branch schedule and Prague local day', () => {
  assert.deepEqual(appointmentReportBranches(new Date('2026-09-30T05:00:00Z')), ['statenice']);
  assert.deepEqual(appointmentReportBranches(new Date('2026-10-01T05:00:00Z')), ['strizkov']);
  assert.deepEqual(appointmentReportBranches(new Date('2026-10-04T05:00:00Z')), []);
});

test('appointment day report lists customers and is idempotent per recipient', () => {
  const appointment = {
    appointmentId: '11111111-1111-4111-8111-111111111111',
    orderId: '22222222-2222-4222-8222-222222222222',
    status: 'confirmed',
    branch: 'statenice',
    startsAt: '2026-09-30T13:00:00Z',
    endsAt: '2026-09-30T13:20:00Z',
    publicCode: 'BUBU-TEST',
    course: 'b',
    package: 'single',
    totalCzk: 25900,
    contact: {
      firstName: '<Jan>',
      lastName: 'Novák',
      phone: '+420777111222',
      email: 'jan@example.invalid',
    },
  } satisfies AdminAppointment;
  const input = {
    branch: 'statenice' as const,
    date: '2026-09-30',
    to: 'statenice@autoskolabubu.cz',
    appointments: [appointment],
  };
  const email = appointmentDayReportEmail(input);
  assert.equal(email.metadata?.count, '1');
  assert.match(email.text, /15:00.*BUBU-TEST/);
  assert.match(email.html ?? '', /&lt;Jan&gt;/);
  assert.doesNotMatch(email.html ?? '', /<Jan>/);
  assert.equal(email.idempotencyKey, appointmentDayReportEmail(input).idempotencyKey);
  assert.notEqual(
    email.idempotencyKey,
    appointmentDayReportEmail({ ...input, to: 'jakub.abraham@autoskolabubu.cz' }).idempotencyKey,
  );
});

test('admin enrollment actions produce distinct customer emails without duplicate keys', () => {
  const base = {
    orderId: '22222222-2222-4222-8222-222222222222',
    appointmentId: '11111111-1111-4111-8111-111111111111',
    publicCode: 'BUBU-TEST',
    to: 'student@example.invalid',
    origin: 'https://www.autoskolabubu.cz',
  };
  const welcome = adminEnrollmentEmail({ ...base, action: 'attend' });
  const noShow = adminEnrollmentEmail({ ...base, action: 'no_show' });
  const cancelled = adminEnrollmentEmail({ ...base, action: 'cancel' });
  assert.equal(welcome.eventType, 'enrollment_welcome');
  assert.match(welcome.text, /třetí přednášce.*připouštěcí test/);
  assert.match(welcome.text, /dohody o splátkách/);
  assert.match(welcome.text, /Zbývající přednášky si naplánujte v aplikaci Moje Autoškola/);
  assert.match(welcome.text, /nejpozději 24 hodin/);
  assert.match(welcome.text, /info@autoskolabubu\.cz/);
  assert.match(welcome.text, /K eTestům se dostanete také prostřednictvím aplikace/);
  assert.match(welcome.text, /apps\.apple\.com\/cz\/app\/moje-auto%C5%A1kola\/id1449593403/);
  assert.match(
    welcome.text,
    /play\.google\.com\/store\/apps\/details\?id=cz\.moje_autoskola&hl=cs/,
  );
  assert.match(welcome.html ?? '', /href="https:\/\/apps\.apple\.com/);
  assert.match(welcome.html ?? '', /href="https:\/\/play\.google\.com/);
  assert.equal(noShow.eventType, 'appointment_no_show');
  assert.match(noShow.text, /nedostavil\/a/);
  assert.match(noShow.text, /https:\/\/www\.autoskolabubu\.cz\/spravovat-termin\?kod=BUBU-TEST/);
  assert.equal(cancelled.eventType, 'admin_order_cancelled');
  assert.doesNotMatch(cancelled.text, /nedostavil\/a/);
  assert.doesNotMatch(
    adminEnrollmentEmail({ ...base, appointmentId: null, action: 'cancel' }).text,
    /rezervovaný termín/,
  );
  assert.equal(
    new Set([welcome.idempotencyKey, noShow.idempotencyKey, cancelled.idempotencyKey]).size,
    3,
  );
  const followUp = noShowFollowUpEmail({
    ...base,
    scheduledFor: '2026-10-08T12:00:00.000Z',
  });
  assert.equal(followUp.eventType, 'appointment_no_show');
  assert.equal(followUp.scheduledFor, '2026-10-08T12:00:00.000Z');
  assert.notEqual(followUp.idempotencyKey, noShow.idempotencyKey);
  assert.match(followUp.text, /před třemi dny/);
  assert.match(followUp.text, /spravovat-termin\?kod=BUBU-TEST/);
});

test('no-show follow-up stays queued until its scheduled time', async () => {
  const scheduledFor = '2099-10-08T12:00:00.000Z';
  const message = noShowFollowUpEmail({
    orderId: '22222222-2222-4222-8222-222222222222',
    publicCode: 'BUBU-TEST',
    to: 'student@example.invalid',
    origin: 'https://www.autoskolabubu.cz',
    scheduledFor,
  });
  let queued: EmailMessage | undefined;
  let deliveryScheduled = false;
  const store = {
    async createPending(value: EmailMessage) {
      queued = value;
      return { id: '44444444-4444-4444-8444-444444444444' };
    },
  } as unknown as SupabaseEmailEventStore;
  const outbox = new OrderEmailOutbox(
    {
      async send() {
        throw new Error('Future message must not be sent now');
      },
    },
    store,
    () => {
      deliveryScheduled = true;
    },
  );
  assert.equal((await outbox.send(message)).status, 'queued');
  assert.equal(queued?.scheduledFor, scheduledFor);
  assert.equal(deliveryScheduled, false);
});

test('no-show follow-up is skipped after the order is cancelled', async () => {
  const message = noShowFollowUpEmail({
    orderId: '22222222-2222-4222-8222-222222222222',
    publicCode: 'BUBU-TEST',
    to: 'student@example.invalid',
    origin: 'https://www.autoskolabubu.cz',
    scheduledFor: '2026-10-01T12:00:00.000Z',
  });
  const event: EmailEventRow = {
    id: '44444444-4444-4444-8444-444444444444',
    idempotency_key: message.idempotencyKey,
    status: 'pending',
    metadata: { outboxMessage: message },
  };
  let skipped = false;
  const store = {
    async claimDue() {
      return event;
    },
    async isNoShowOrder() {
      return false;
    },
    async markSkipped() {
      skipped = true;
    },
  } as unknown as SupabaseEmailEventStore;
  const outbox = new OrderEmailOutbox(
    {
      async send() {
        throw new Error('Cancelled order must not receive a reminder');
      },
    },
    store,
  );
  assert.equal(await outbox.deliver(event.id), 'skipped');
  assert.equal(skipped, true);
});

test('Lettermint sends report metadata as strings', async () => {
  const originalFetch = globalThis.fetch;
  let payload: { metadata?: Record<string, unknown> } | undefined;
  globalThis.fetch = async (_input, init) => {
    payload = JSON.parse(String(init?.body));
    return new Response(JSON.stringify({ message_id: 'test-message', status: 'accepted' }), {
      status: 200,
    });
  };
  try {
    await new LettermintEmailAdapter('test-token').send({
      idempotencyKey: 'test-report',
      to: 'test@example.invalid',
      subject: 'Test',
      text: 'Test',
      metadata: { count: 8, branch: 'strizkov' },
    });
    assert.deepEqual(payload?.metadata, { count: '8', branch: 'strizkov' });
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('failed email event can be claimed for a safe retry with the same key', async () => {
  const originalFetch = globalThis.fetch;
  const calls: Array<{ method: string; url: string }> = [];
  globalThis.fetch = async (input, init) => {
    const url = String(input);
    const method = init?.method ?? 'GET';
    calls.push({ method, url });
    if (method === 'POST') return Response.json([]);
    assert.match(url, /status=eq\.failed/);
    assert.equal(JSON.parse(String(init?.body)).status, 'pending');
    return Response.json([
      { id: 'event-1', idempotency_key: 'report-1', status: 'pending', metadata: {} },
    ]);
  };
  try {
    const store = new SupabaseEmailEventStore({
      SUPABASE_URL: 'https://example.supabase.co',
      SUPABASE_SERVICE_ROLE_KEY: 'test-key',
    });
    const event = await store.createPending({
      idempotencyKey: 'report-1',
      to: 'test@example.invalid',
      subject: 'Test',
      text: 'Test',
    });
    assert.equal(event?.id, 'event-1');
    assert.deepEqual(
      calls.map((call) => call.method),
      ['POST', 'PATCH'],
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});

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
  assert.match(email.text, /který ho zapíše do EZKarty/);
  assert.match(email.text, /Jako autoškola k němu nemáme přístup/);
  assert.match(email.html ?? '', /který ho zapíše do EZKarty/);
  assert.match(email.text, /první splátka 8 700 Kč, druhá splátka 8 600 Kč/);
  assert.doesNotMatch(email.text, /pošlete odpovědí na tento e-mail/);
  assert.doesNotMatch(email.text, /PDF z EZKarty zaslaným e-mailem/);
  assert.match(email.html ?? '', /Prosím o zápis po 16\. hodině\./);
  assert.match(email.html ?? '', /<strong>oboustranně<\/strong>/);
});

test('Kladno confirmation asks for documents by email and replies to the branch', () => {
  const email = orderConfirmationEmail({
    ...orderInput,
    note: '',
    selection: { ...orderInput.selection, branch: 'kladno' },
    appointment: null,
  });
  assert.equal(email.replyTo, 'objednavky@autoskolabubu.cz');
  for (const content of [email.text, email.html ?? '']) {
    assert.match(content, /Kopii nám pošlete odpovědí na tento e-mail/);
    assert.match(content, /Posudek nám pošlete odpovědí na tento e-mail/);
    assert.match(content, /první hodinu teorie/);
    assert.match(content, /ve třech splátkách/);
    assert.match(content, /Zahájení výuky/);
    assert.match(content, /není možné zahájit výuku a výcvik/);
    assert.doesNotMatch(content, /zápis/i);
  }
});

test('Kladno unbooked orders are not eligible for booking reminders', () => {
  const order: PublicOrderOverview = {
    orderId: orderInput.orderId,
    publicCode: orderInput.publicCode,
    status: 'confirmed',
    contact: orderInput.contact,
    selection: { ...orderInput.selection, branch: 'kladno' },
    price: orderInput.price,
    addons: [],
    appointment: null,
    createdAt: orderInput.createdAt.toISOString(),
  };
  assert.equal(needsBookingReminder(order), false);
  assert.equal(needsBookingReminder({ ...order, selection: orderInput.selection }), true);
});

test('appointment reminders include the document checklist without a deposit request', () => {
  const order: PublicOrderOverview = {
    orderId: orderInput.orderId,
    publicCode: orderInput.publicCode,
    status: 'confirmed',
    contact: orderInput.contact,
    selection: orderInput.selection,
    price: orderInput.price,
    addons: [],
    appointment: { ...orderInput.appointment, branch: 'strizkov', status: 'reserved' },
    createdAt: orderInput.createdAt.toISOString(),
  };
  for (const kind of ['appointment_reminder_3d', 'appointment_reminder_same_day'] as const) {
    const email = appointmentReminderEmail({ order, kind, manageUrl: orderInput.manageUrl });
    assert.ok(email);
    for (const content of [email.text, email.html ?? '']) {
      assert.match(content, /oboustranně vytištěnou, vyplněnou a podepsanou přihlášku/);
      assert.match(content, /zdravotní posudek/);
      assert.match(content, /občanský průkaz/);
      assert.doesNotMatch(content, /záloh|5&nbsp;000|5 000 Kč/i);
    }
  }
});

test('reschedule confirmation names the new appointment and can be retried from the outbox', async () => {
  const order: PublicOrderOverview = {
    orderId: orderInput.orderId,
    publicCode: orderInput.publicCode,
    status: 'rescheduled',
    contact: orderInput.contact,
    selection: orderInput.selection,
    price: orderInput.price,
    addons: [],
    appointment: {
      id: '33333333-3333-4333-8333-333333333333',
      branch: 'strizkov',
      status: 'rescheduled',
      startsAt: '2026-10-05T15:40:00Z',
      endsAt: '2026-10-05T16:00:00Z',
    },
    createdAt: orderInput.createdAt.toISOString(),
  };
  const email = appointmentChangedEmail({
    order,
    manageUrl: orderInput.manageUrl,
    kind: 'rescheduled',
  });
  assert.equal(email.eventType, 'appointment_rescheduled');
  assert.equal(email.to, order.contact.email);
  assert.match(email.subject, /Potvrzení nového termínu zápisu/);
  for (const content of [email.text, email.html ?? '']) {
    assert.match(content, /Nový termín zápisu/);
    assert.match(content, /5\. října 2026.*17:40/);
    assert.match(content, /Adresa zápisu/);
  }
  const event: EmailEventRow = {
    id: '44444444-4444-4444-8444-444444444444',
    idempotency_key: email.idempotencyKey,
    status: 'pending',
    metadata: {},
  };
  let delivered: EmailMessage | undefined;
  const store = {
    async createPending(message: EmailMessage) {
      event.metadata = { outboxMessage: message };
      return event;
    },
    async claimDue() {
      return event;
    },
    async markSent() {},
  } as unknown as SupabaseEmailEventStore;
  const outbox = new OrderEmailOutbox(
    {
      async send(message) {
        delivered = message;
        return { status: 'accepted' };
      },
    },
    store,
  );
  assert.deepEqual(await outbox.send(email), { status: 'queued' });
  assert.equal(await outbox.deliver(event.id), 'sent');
  assert.equal(delivered?.eventType, 'appointment_rescheduled');
  assert.match(delivered?.text ?? '', /Nový termín zápisu/);
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

test('admin action mail uses the existing retryable outbox without application attachment', async () => {
  const message = adminEnrollmentEmail({
    orderId: '22222222-2222-4222-8222-222222222222',
    publicCode: 'BUBU-TEST',
    to: 'student@example.invalid',
    action: 'attend',
    origin: 'https://www.autoskolabubu.cz',
  });
  const event: EmailEventRow = {
    id: '44444444-4444-4444-8444-444444444447',
    idempotency_key: message.idempotencyKey,
    status: 'pending',
    metadata: {},
  };
  let delivered: EmailMessage | undefined;
  const store = {
    async createPending(value: EmailMessage) {
      event.metadata = value.metadata ?? {};
      return event;
    },
    async claimDue() {
      return event;
    },
    async markSent() {},
    async markFailed() {},
    async retryLater() {},
    async listDue() {
      return [event];
    },
  } as unknown as SupabaseEmailEventStore;
  const outbox = new OrderEmailOutbox(
    {
      async send(value) {
        delivered = value;
        return { status: 'pending' };
      },
    },
    store,
  );
  assert.equal((await outbox.send(message)).status, 'queued');
  assert.equal((await outbox.drainDue()).sent, 1);
  assert.equal(delivered?.eventType, 'enrollment_welcome');
  assert.equal(delivered?.attachments, undefined);
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
