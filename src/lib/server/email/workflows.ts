import type { PublicOrderOverview } from '../../booking/repository';
import { money } from '../../format';
import { branchLabel, courseLabel, packageLabel } from '../../order-display';
import {
  createTransactionalEmailAdapter,
  isTransactionalEmailConfigured,
  orderNotificationEmail,
  reportEmailAddress,
} from './index';
import { SupabaseEmailRepository } from './repository';
import {
  appointmentReminderEmail,
  reportEmail,
  monthLabel,
  ORDER_FROM,
  ORDER_REPLY_TO,
} from './templates';
import {
  addDaysToLocalDate,
  eventKey,
  formatEmailDate,
  formatEmailDateTime,
  toPragueDate,
} from './utils';
import type { EmailMessage } from '../../integrations/contracts';

export function assertCronAuthorized(request: Request, env: Record<string, string | undefined>) {
  const secret = env.CRON_SECRET;
  if (!secret) return false;
  return request.headers.get('authorization') === `Bearer ${secret}`;
}

function manageUrl(origin: string, code: string) {
  const url = new URL('/spravovat-termin', origin);
  url.searchParams.set('kod', code);
  return url.href;
}

function unbookedReminderMessage(input: {
  order: PublicOrderOverview;
  days: 3 | 7 | 14;
  origin: string;
}): EmailMessage {
  const subjects = {
    3: 'Nezapomeňte si rezervovat termín zápisu – Autoškola BuBu',
    7: 'Vaše přihláška stále čeká na rezervaci zápisu',
    14: 'Dokončete prosím svou registraci do Autoškoly BuBu',
  } as const;
  const url = manageUrl(input.origin, input.order.publicCode);
  const text = [
    `Dobrý den, ${input.order.contact.firstName},`,
    '',
    'u vaší objednávky v Autoškole BuBu zatím nevidíme rezervovaný termín osobního zápisu.',
    `Objednávka: ${input.order.publicCode}`,
    `Kurz: ${courseLabel(input.order.selection.course)}`,
    `Pobočka: ${branchLabel(input.order.selection.branch)}`,
    '',
    `Termín si můžete vybrat zde: ${url}`,
    '',
    'Zpráva je pouze připomínka k dokončení registrace.',
  ].join('\n');
  return {
    idempotencyKey: eventKey(`unbooked-${input.days}d`, input.order.orderId),
    eventType: `unbooked_reminder_${input.days}d`,
    orderId: input.order.orderId,
    from: ORDER_FROM,
    replyTo: ORDER_REPLY_TO,
    to: input.order.contact.email,
    subject: subjects[input.days],
    text,
    html: `<p>Dobrý den, ${input.order.contact.firstName},</p><p>u vaší objednávky v Autoškole BuBu zatím nevidíme rezervovaný termín osobního zápisu.</p><p><strong>Objednávka:</strong> ${input.order.publicCode}<br><strong>Kurz:</strong> ${courseLabel(input.order.selection.course)}<br><strong>Pobočka:</strong> ${branchLabel(input.order.selection.branch)}</p><p><a href="${url}">Vybrat termín zápisu</a></p>`,
    tag: `unbooked-${input.days}d`,
    metadata: { publicCode: input.order.publicCode },
  };
}

function inactiveOrderAlert(input: { order: PublicOrderOverview; to: string }): EmailMessage {
  const age = Math.max(
    0,
    Math.floor((Date.now() - new Date(input.order.createdAt).getTime()) / 86400000),
  );
  return {
    idempotencyKey: eventKey('inactive-order-alert', input.order.orderId),
    eventType: 'inactive_order_alert',
    orderId: input.order.orderId,
    from: ORDER_FROM,
    replyTo: input.order.contact.email,
    to: input.to,
    subject: `Neaktivní objednávka – ${input.order.contact.firstName} ${input.order.contact.lastName} – bez termínu zápisu`,
    text: [
      'Neaktivní objednávka bez termínu zápisu.',
      `Zákazník: ${input.order.contact.firstName} ${input.order.contact.lastName}`,
      `E-mail: ${input.order.contact.email}`,
      `Telefon: ${input.order.contact.phone}`,
      `Kurz: ${courseLabel(input.order.selection.course)}`,
      `Pobočka: ${branchLabel(input.order.selection.branch)}`,
      `Balíček: ${packageLabel(input.order.selection.package)}`,
      `Datum objednávky: ${formatEmailDateTime(input.order.createdAt)}`,
      `Hodnota objednávky: ${money(input.order.price.amount)}`,
      `Stáří objednávky: ${age} dní`,
      'Odeslané připomínky: 3, 7 a 14 dní.',
    ].join('\n'),
    tag: 'inactive-order-alert',
    metadata: { publicCode: input.order.publicCode },
  };
}

export async function processEmailReminders(
  env: Record<string, string | undefined>,
  now = new Date(),
) {
  if (!isTransactionalEmailConfigured(env)) return { ok: false, code: 'EMAIL_NOT_CONFIGURED' };
  const origin = env.APP_ORIGIN || 'https://autoskolabubu.vercel.app';
  const repository = new SupabaseEmailRepository(env);
  const email = createTransactionalEmailAdapter(env);
  const today = toPragueDate(now);
  const messages: EmailMessage[] = [];

  for (const order of await repository.appointmentReminderCandidates({ localDate: today })) {
    if (!order.appointment) continue;
    const appointmentDay = toPragueDate(order.appointment.startsAt);
    const threeDaysBefore = addDaysToLocalDate(today, 3);
    const kind =
      appointmentDay === today
        ? 'appointment_reminder_same_day'
        : appointmentDay === threeDaysBefore
          ? 'appointment_reminder_3d'
          : null;
    if (!kind) continue;
    const message = appointmentReminderEmail({
      order,
      kind,
      manageUrl: manageUrl(origin, order.publicCode),
    });
    if (message) messages.push(message);
  }

  for (const order of await repository.unbookedOrderCandidates({ localDate: today })) {
    const createdDay = toPragueDate(order.createdAt);
    if (today === addDaysToLocalDate(createdDay, 3))
      messages.push(unbookedReminderMessage({ order, days: 3, origin }));
    if (today === addDaysToLocalDate(createdDay, 7))
      messages.push(unbookedReminderMessage({ order, days: 7, origin }));
    if (today === addDaysToLocalDate(createdDay, 14))
      messages.push(unbookedReminderMessage({ order, days: 14, origin }));
    if (today === addDaysToLocalDate(createdDay, 15))
      messages.push(inactiveOrderAlert({ order, to: orderNotificationEmail(env) }));
  }

  const results = await Promise.allSettled(messages.map((message) => email.send(message)));
  return {
    ok: true,
    attempted: messages.length,
    sentOrSkipped: results.filter((result) => result.status === 'fulfilled').length,
    failed: results.filter((result) => result.status === 'rejected').length,
  };
}

function reportSummaryText(summary: Awaited<ReturnType<SupabaseEmailRepository['report']>>) {
  const map = (
    items: { key: string; count: number; valueCzk: number }[],
    label: (key: string) => string,
  ) =>
    items.length
      ? items
          .map((item) => `${label(item.key)}: ${item.count} (${money(item.valueCzk)})`)
          .join(', ')
      : 'žádné';
  return {
    'Objednávky celkem': summary.ordersTotal,
    'Hodnota objednávek': money(summary.ordersValueCzk),
    'Průměrná hodnota objednávky': money(Math.round(summary.averageOrderValueCzk)),
    'Rezervovaný zápis': summary.bookedAppointments,
    'Bez rezervace zápisu': summary.withoutAppointment,
    'Zrušené objednávky': summary.cancelledOrders,
    Skupiny: map(summary.byCourse, courseLabel),
    Pobočky: map(summary.byBranch, branchLabel),
    Balíčky: map(summary.byPackage, packageLabel),
    ...(summary.dailyAverage === undefined
      ? {}
      : { 'Denní průměr objednávek': summary.dailyAverage.toFixed(1) }),
    ...(summary.strongestDayByOrders
      ? {
          'Nejsilnější den podle počtu': `${summary.strongestDayByOrders.date} (${summary.strongestDayByOrders.count})`,
        }
      : {}),
    ...(summary.strongestDayByValue
      ? {
          'Nejsilnější den podle hodnoty': `${summary.strongestDayByValue.date} (${money(summary.strongestDayByValue.valueCzk)})`,
        }
      : {}),
  };
}

export async function processDailyReport(
  env: Record<string, string | undefined>,
  now = new Date(),
) {
  if (!isTransactionalEmailConfigured(env)) return { ok: false, code: 'EMAIL_NOT_CONFIGURED' };
  const today = toPragueDate(now);
  const reportDate = addDaysToLocalDate(today, -1);
  const summary = await new SupabaseEmailRepository(env).report({
    from: reportDate,
    to: today,
    days: 1,
  });
  const message = reportEmail({
    to: reportEmailAddress(env),
    eventType: 'daily_order_report',
    title: `Denní report objednávek – ${formatEmailDate(`${reportDate}T12:00:00Z`)}`,
    reportKey: reportDate,
    summary: reportSummaryText(summary),
  });
  await createTransactionalEmailAdapter(env).send(message);
  return { ok: true, reportDate };
}

export async function processMonthlyReport(
  env: Record<string, string | undefined>,
  now = new Date(),
) {
  if (!isTransactionalEmailConfigured(env)) return { ok: false, code: 'EMAIL_NOT_CONFIGURED' };
  const today = toPragueDate(now);
  if (!today.endsWith('-01')) return { ok: true, skipped: 'not-first-day' };
  const current = new Date(`${today}T12:00:00Z`);
  const fromDate = new Date(Date.UTC(current.getUTCFullYear(), current.getUTCMonth() - 1, 1, 12));
  const toDate = new Date(Date.UTC(current.getUTCFullYear(), current.getUTCMonth(), 1, 12));
  const from = fromDate.toISOString().slice(0, 10);
  const to = toDate.toISOString().slice(0, 10);
  const month = from.slice(0, 7);
  const days = Math.round((toDate.getTime() - fromDate.getTime()) / 86400000);
  const summary = await new SupabaseEmailRepository(env).report({ from, to, days });
  const message = reportEmail({
    to: reportEmailAddress(env),
    eventType: 'monthly_order_report',
    title: `Měsíční report objednávek – ${monthLabel(month)}`,
    reportKey: month,
    summary: reportSummaryText(summary),
  });
  await createTransactionalEmailAdapter(env).send(message);
  return { ok: true, month };
}
