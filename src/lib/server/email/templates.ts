import type { EmailMessage } from '../../integrations/contracts';
import type { PublicOrderOverview, OrderAddon, Contact } from '../../booking/repository';
import type { Selection, Quote } from '../../pricing/quote';
import { branches } from '../../catalog';
import { money } from '../../format';
import { branchLabel, courseLabel, packageLabel } from '../../order-display';
import {
  escapeHtml,
  eventKey,
  formatEmailDate,
  formatEmailDateTime,
  monthLabel,
  stripHeader,
} from './utils';

const ORDER_FROM = 'Autoškola BuBu <objednavky@autoskolabubu.cz>';
const CONTACT_FROM = 'Autoškola BuBu web <objednavky@autoskolabubu.cz>';
const ORDER_REPLY_TO = 'objednavky@autoskolabubu.cz';

export type CreatedOrderEmailInput = {
  orderId: string;
  publicCode: string;
  contact: Contact;
  selection: Selection;
  price: Extract<Quote, { ok: true }>;
  addons: OrderAddon[];
  appointment: { id: string; startsAt: string; endsAt: string } | null;
  createdAt: Date;
  thankYouUrl: string;
  manageUrl: string;
  applicationFormUrl: string;
  notificationEmail?: string;
};

function layout(title: string, body: string) {
  return `<!doctype html><html lang="cs"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(title)}</title></head><body style="margin:0;background:#f4faf9;font-family:Arial,Helvetica,sans-serif;color:#17345d;"><div style="display:none;max-height:0;overflow:hidden;opacity:0;">Řidičák bez stresu – Autoškola BuBu</div><main style="max-width:680px;margin:0 auto;padding:28px 16px;"><section style="background:#ffffff;border:1px solid #dcebea;border-radius:24px;padding:28px;box-shadow:0 16px 40px rgba(23,52,93,.08);"><p style="margin:0 0 12px;font-size:13px;letter-spacing:.08em;text-transform:uppercase;color:#4daeb6;font-weight:700;">Autoškola BuBu</p><h1 style="margin:0 0 20px;font-size:28px;line-height:1.15;color:#17345d;">${escapeHtml(title)}</h1>${body}</section><p style="margin:18px 4px 0;font-size:13px;line-height:1.6;color:#667998;">Tento e-mail se týká objednávky nebo dotazu na webu Autoškoly BuBu. Pokud jste ho nečekali, napište nám prosím na objednavky@autoskolabubu.cz.</p></main></body></html>`;
}

function rows(items: Array<[string, string]>) {
  return `<table role="presentation" style="width:100%;border-collapse:collapse;margin:18px 0;">${items
    .map(
      ([label, value]) =>
        `<tr><td style="padding:10px 0;border-bottom:1px solid #e8f0f0;color:#667998;width:42%;">${escapeHtml(label)}</td><td style="padding:10px 0;border-bottom:1px solid #e8f0f0;font-weight:700;color:#17345d;">${escapeHtml(value)}</td></tr>`,
    )
    .join('')}</table>`;
}

function addonText(addons: OrderAddon[]) {
  if (!addons.length) return 'bez doplňků';
  return addons.map((item) => `${item.title} × ${item.quantity} (${money(item.total)})`).join(', ');
}

function branchAddress(id: string) {
  return branches.find((branch) => branch.id === id)?.address ?? branchLabel(id);
}

export function orderConfirmationEmail(input: CreatedOrderEmailInput): EmailMessage {
  const appointmentText = input.appointment
    ? formatEmailDateTime(input.appointment.startsAt)
    : 'Termín zápisu zatím není vybraný';
  const body = `<p style="font-size:17px;line-height:1.65;margin:0 0 16px;">Dobrý den, ${escapeHtml(input.contact.firstName)}, děkujeme za objednávku. Níže najdete přehled a co je potřeba připravit před zápisem.</p>${rows(
    [
      ['Číslo objednávky', input.publicCode],
      ['Kurz', courseLabel(input.selection.course)],
      ['Pobočka', branchLabel(input.selection.branch)],
      ['Balíček', packageLabel(input.selection.package)],
      ['Doplňky', addonText(input.addons)],
      ['Celková hodnota objednávky', money(input.price.amount)],
      ['Termín zápisu', appointmentText],
      ['Adresa zápisu', branchAddress(input.selection.branch)],
    ],
  )}<section style="background:#f4faf9;border:1px solid #dcebea;border-radius:18px;padding:18px;margin:22px 0;"><h2 style="font-size:19px;margin:0 0 12px;color:#17345d;">Co připravit před zápisem</h2><ol style="padding-left:22px;margin:0;color:#17345d;font-size:15px;line-height:1.7;"><li><strong>Vyplňte přihlášku.</strong> Odkaz ke stažení najdete zde: <a href="${escapeHtml(input.applicationFormUrl)}" style="color:#17345d;font-weight:700;">přihláška k výcviku</a>. Přihlášku přikládáme také jako PDF přílohu. Vyplňte prosím první část dokumentu označenou „Vyplňuje žadatel“. Vyplněnou první stranu nám pošlete odpovědí na tento e-mail. Originál si uschovejte a přineste jej osobně při zahájení výuky.</li><li style="margin-top:12px;"><strong>Vyřiďte zdravotní posudek.</strong> Pro zahájení kurzu potřebujeme posudek zdravotní způsobilosti. Od 1. 1. 2026 ho vydává pouze váš registrující ošetřující lékař, tedy praktický lékař pro děti a dorost, všeobecný praktický lékař, případně lékař pracovnělékařských služeb.</li><li style="margin-top:12px;"><strong>Doložte zdravotní způsobilost.</strong> Posudek by měl být nově vydáván elektronicky a zapsán do aplikace EZKarta v rámci databáze NZIP. Autoškola do tohoto systému nemá přístup, proto nám posudek doložte jedním z těchto způsobů: požádejte lékaře o písemné potvrzení jako doposud, stáhněte PDF v aplikaci EZKarta a pošlete nám ho e-mailem, nebo PDF vytiskněte a přineste spolu s přihláškou. Informace k EZKartě: <a href="https://www.nzip.cz/ezkarta" style="color:#17345d;font-weight:700;">nzip.cz/ezkarta</a>.</li></ol><p style="font-size:15px;line-height:1.6;color:#17345d;margin:14px 0 0;"><strong>Pozor:</strong> zdravotní posudek nesmí být starší než 3 měsíce.</p></section><p style="font-size:16px;line-height:1.65;margin:18px 0;"><strong>Při zápisu se platí nevratná záloha za kurz 5&nbsp;000 Kč</strong> na pobočce, ideálně v hotovosti, případně okamžitým převodem na účet.</p><p style="margin:24px 0;"><a href="${escapeHtml(input.thankYouUrl)}" style="display:inline-block;background:#4daeb6;color:#ffffff;text-decoration:none;padding:13px 18px;border-radius:999px;font-weight:700;">Zobrazit objednávku</a> <a href="${escapeHtml(input.manageUrl)}" style="display:inline-block;color:#17345d;text-decoration:underline;margin-left:12px;font-weight:700;">Změnit termín zápisu</a></p><p style="font-size:15px;line-height:1.6;color:#667998;margin:0;">Na zápis si prosím vezměte občanský průkaz, originál přihlášky a zdravotní posudek.</p>`;
  const text = [
    `Dobrý den, ${input.contact.firstName}, děkujeme za objednávku v Autoškole BuBu.`,
    '',
    `Číslo objednávky: ${input.publicCode}`,
    `Kurz: ${courseLabel(input.selection.course)}`,
    `Pobočka: ${branchLabel(input.selection.branch)}`,
    `Balíček: ${packageLabel(input.selection.package)}`,
    `Doplňky: ${addonText(input.addons)}`,
    `Celková hodnota objednávky: ${money(input.price.amount)}`,
    `Termín zápisu: ${appointmentText}`,
    `Adresa zápisu: ${branchAddress(input.selection.branch)}`,
    '',
    'Co připravit před zápisem:',
    `1. Vyplňte první část přihlášky označenou „Vyplňuje žadatel“. Přihlášku stáhnete zde: ${input.applicationFormUrl}. PDF přikládáme také jako přílohu. Vyplněnou první stranu nám pošlete odpovědí na tento e-mail. Originál si uschovejte a přineste osobně při zahájení výuky.`,
    '2. Vyřiďte zdravotní posudek. Od 1. 1. 2026 ho vydává váš registrující ošetřující lékař, tedy praktický lékař pro děti a dorost, všeobecný praktický lékař, případně lékař pracovnělékařských služeb.',
    '3. Autoškola nemá přístup do EZKarty ani databáze NZIP. Zdravotní způsobilost doložte písemným potvrzením od lékaře, PDF souborem z EZKarty zaslaným e-mailem, nebo vytištěným PDF z EZKarty přineseným spolu s přihláškou. Informace: https://www.nzip.cz/ezkarta',
    'Pozor: zdravotní posudek nesmí být starší než 3 měsíce.',
    '',
    `Přehled objednávky: ${input.thankYouUrl}`,
    `Změna nebo zrušení termínu zápisu: ${input.manageUrl}`,
    '',
    'Při zápisu se platí nevratná záloha za kurz 5 000 Kč na pobočce, ideálně v hotovosti, případně okamžitým převodem na účet.',
  ].join('\n');
  return {
    idempotencyKey: eventKey('order-confirmation', input.orderId),
    eventType: 'order_confirmation',
    orderId: input.orderId,
    appointmentId: input.appointment?.id,
    from: ORDER_FROM,
    replyTo: ORDER_REPLY_TO,
    to: input.contact.email,
    subject: `Potvrzení objednávky ${input.publicCode} – Autoškola BuBu`,
    html: layout('Potvrzení objednávky', body),
    text,
    tag: 'order-confirmation',
    metadata: {
      publicCode: input.publicCode,
      course: input.selection.course,
      branch: input.selection.branch,
    },
  };
}
export function internalNewOrderEmail(input: CreatedOrderEmailInput): EmailMessage | null {
  if (!input.notificationEmail) return null;
  const appointmentText = input.appointment
    ? formatEmailDateTime(input.appointment.startsAt)
    : 'bez termínu zápisu';
  const name = `${input.contact.firstName} ${input.contact.lastName}`;
  const body = `${rows([
    ['Zákazník', name],
    ['E-mail', input.contact.email],
    ['Telefon', input.contact.phone],
    ['Objednávka', input.publicCode],
    ['Kurz', courseLabel(input.selection.course)],
    ['Pobočka', branchLabel(input.selection.branch)],
    ['Balíček', packageLabel(input.selection.package)],
    ['Doplňky', addonText(input.addons)],
    ['Hodnota objednávky', money(input.price.amount)],
    ['Vytvořeno', formatEmailDateTime(input.createdAt)],
    ['Termín zápisu', appointmentText],
  ])}`;
  const text = [
    `Nová objednávka – ${name}`,
    `Zákazník: ${name}`,
    `E-mail: ${input.contact.email}`,
    `Telefon: ${input.contact.phone}`,
    `Objednávka: ${input.publicCode}`,
    `Kurz: ${courseLabel(input.selection.course)}`,
    `Pobočka: ${branchLabel(input.selection.branch)}`,
    `Balíček: ${packageLabel(input.selection.package)}`,
    `Doplňky: ${addonText(input.addons)}`,
    `Hodnota objednávky: ${money(input.price.amount)}`,
    `Vytvořeno: ${formatEmailDateTime(input.createdAt)}`,
    `Termín zápisu: ${appointmentText}`,
  ].join('\n');
  return {
    idempotencyKey: eventKey('internal-new-order', input.orderId),
    eventType: 'internal_new_order',
    orderId: input.orderId,
    appointmentId: input.appointment?.id,
    from: ORDER_FROM,
    replyTo: input.contact.email,
    to: input.notificationEmail,
    subject: stripHeader(
      `Nová objednávka – ${courseLabel(input.selection.course)} – ${branchLabel(input.selection.branch)} – ${name}`,
    ),
    html: layout('Nová objednávka z webu', body),
    text,
    tag: 'internal-new-order',
    metadata: {
      publicCode: input.publicCode,
      course: input.selection.course,
      branch: input.selection.branch,
    },
  };
}

export function contactFormEmail(input: {
  to: string;
  source: string;
  name: string;
  email: string;
  phone?: string;
  subject?: string;
  message: string;
  branch?: string;
}): EmailMessage {
  const subject = input.subject || 'Dotaz z webu';
  const body = `${rows([
    ['Jméno', input.name],
    ['E-mail', input.email],
    ['Telefon', input.phone || 'neuvedeno'],
    ['Zdroj', input.source],
    ['Pobočka', input.branch ? branchLabel(input.branch) : 'obecný kontakt'],
  ])}<div style="white-space:pre-wrap;font-size:16px;line-height:1.65;color:#17345d;">${escapeHtml(input.message)}</div>`;
  const text = [
    `Jméno: ${input.name}`,
    `E-mail: ${input.email}`,
    `Telefon: ${input.phone || 'neuvedeno'}`,
    `Zdroj: ${input.source}`,
    input.branch ? `Pobočka: ${branchLabel(input.branch)}` : 'Pobočka: obecný kontakt',
    '',
    input.message,
  ].join('\n');
  return {
    idempotencyKey: eventKey('contact', input.source, input.email, input.message.slice(0, 120)),
    eventType: 'contact_form_notification',
    from: CONTACT_FROM,
    replyTo: input.email,
    to: input.to,
    subject: stripHeader(`Dotaz z webu – ${subject}`),
    html: layout('Nový dotaz z webu', body),
    text,
    tag: 'contact-form',
    metadata: { source: input.source, branch: input.branch ?? null },
  };
}

export function appointmentChangedEmail(input: {
  order: PublicOrderOverview;
  manageUrl: string;
  kind: 'rescheduled' | 'cancelled';
}): EmailMessage {
  const isCancelled = input.kind === 'cancelled';
  const appointment = input.order.appointment;
  const title = isCancelled ? 'Termín zápisu byl zrušen' : 'Termín zápisu byl změněn';
  const appointmentText = appointment ? formatEmailDateTime(appointment.startsAt) : 'bez termínu';
  const body = `<p style="font-size:17px;line-height:1.65;margin:0 0 16px;">Dobrý den, ${escapeHtml(input.order.contact.firstName)}, ${isCancelled ? 'potvrzujeme zrušení termínu zápisu.' : 'potvrzujeme změnu termínu zápisu.'}</p>${rows(
    [
      ['Objednávka', input.order.publicCode],
      ['Kurz', courseLabel(input.order.selection.course)],
      ['Pobočka', branchLabel(input.order.selection.branch)],
      ['Aktuální termín', isCancelled ? 'zrušený' : appointmentText],
    ],
  )}<p style="margin:24px 0;"><a href="${escapeHtml(input.manageUrl)}" style="display:inline-block;background:#4daeb6;color:#ffffff;text-decoration:none;padding:13px 18px;border-radius:999px;font-weight:700;">Spravovat termín</a></p>`;
  return {
    idempotencyKey: eventKey(
      `appointment-${input.kind}`,
      input.order.orderId,
      appointment?.id,
      appointment?.startsAt,
    ),
    eventType: isCancelled ? 'appointment_cancelled' : 'appointment_rescheduled',
    orderId: input.order.orderId,
    appointmentId: appointment?.id,
    from: ORDER_FROM,
    replyTo: ORDER_REPLY_TO,
    to: input.order.contact.email,
    subject: `${title} – Autoškola BuBu`,
    html: layout(title, body),
    text: `${title}\n\nObjednávka: ${input.order.publicCode}\nKurz: ${courseLabel(input.order.selection.course)}\nPobočka: ${branchLabel(input.order.selection.branch)}\nAktuální termín: ${isCancelled ? 'zrušený' : appointmentText}\n\nSpráva termínu: ${input.manageUrl}`,
    tag: `appointment-${input.kind}`,
    metadata: { publicCode: input.order.publicCode },
  };
}

export function appointmentReminderEmail(input: {
  order: PublicOrderOverview;
  kind: 'appointment_reminder_3d' | 'appointment_reminder_same_day';
  manageUrl: string;
}): EmailMessage | null {
  if (!input.order.appointment) return null;
  const sameDay = input.kind === 'appointment_reminder_same_day';
  const title = sameDay
    ? 'Dnes vás čeká zápis do Autoškoly BuBu'
    : `Připomínka zápisu do Autoškoly BuBu – ${formatEmailDate(input.order.appointment.startsAt)}`;
  const body = `<p style="font-size:17px;line-height:1.65;margin:0 0 16px;">Dobrý den, ${escapeHtml(input.order.contact.firstName)}, připomínáme váš termín zápisu.</p>${rows(
    [
      ['Objednávka', input.order.publicCode],
      ['Termín', formatEmailDateTime(input.order.appointment.startsAt)],
      ['Pobočka', branchLabel(input.order.appointment.branch)],
      ['Adresa', branchAddress(input.order.appointment.branch)],
    ],
  )}<p style="font-size:16px;line-height:1.65;margin:18px 0;"><strong>Při zápisu se platí nevratná záloha 5&nbsp;000 Kč</strong> ideálně v hotovosti, případně okamžitým převodem.</p><p style="margin:24px 0;"><a href="${escapeHtml(input.manageUrl)}" style="display:inline-block;background:#4daeb6;color:#ffffff;text-decoration:none;padding:13px 18px;border-radius:999px;font-weight:700;">Spravovat termín</a></p>`;
  return {
    idempotencyKey: eventKey(
      input.kind,
      input.order.orderId,
      input.order.appointment.id,
      input.order.appointment.startsAt,
    ),
    eventType: input.kind,
    orderId: input.order.orderId,
    appointmentId: input.order.appointment.id,
    from: ORDER_FROM,
    replyTo: ORDER_REPLY_TO,
    to: input.order.contact.email,
    subject: title,
    html: layout(title, body),
    text: `${title}\n\nObjednávka: ${input.order.publicCode}\nTermín: ${formatEmailDateTime(input.order.appointment.startsAt)}\nPobočka: ${branchLabel(input.order.appointment.branch)}\nAdresa: ${branchAddress(input.order.appointment.branch)}\n\nPři zápisu se platí nevratná záloha 5 000 Kč ideálně v hotovosti, případně okamžitým převodem.\n\nSpráva termínu: ${input.manageUrl}`,
    tag: input.kind,
    metadata: {
      publicCode: input.order.publicCode,
      appointmentStartsAt: input.order.appointment.startsAt,
    },
  };
}

export function reportEmail(input: {
  to: string;
  eventType: 'daily_order_report' | 'monthly_order_report';
  title: string;
  reportKey: string;
  summary: Record<string, unknown>;
}): EmailMessage {
  const summaryRows = Object.entries(input.summary).map(
    ([key, value]) => [key, String(value)] as [string, string],
  );
  return {
    idempotencyKey: eventKey(input.eventType, input.reportKey),
    eventType: input.eventType,
    from: ORDER_FROM,
    replyTo: ORDER_REPLY_TO,
    to: input.to,
    subject: input.title,
    html: layout(input.title, rows(summaryRows)),
    text: [input.title, '', ...summaryRows.map(([key, value]) => `${key}: ${value}`)].join('\n'),
    tag: input.eventType,
    metadata: { reportKey: input.reportKey },
    reportDate: input.eventType === 'daily_order_report' ? input.reportKey : undefined,
    reportMonth: input.eventType === 'monthly_order_report' ? input.reportKey : undefined,
  };
}

export { ORDER_FROM, ORDER_REPLY_TO, monthLabel };
