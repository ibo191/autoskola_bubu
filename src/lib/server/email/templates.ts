import type { EmailMessage } from '../../integrations/contracts';
import type { PublicOrderOverview, OrderAddon, Contact } from '../../booking/repository';
import type { Selection, Quote } from '../../pricing/quote';
import { branches } from '../../catalog';
import { money } from '../../format';
import { branchLabel, selectionLabel, packageLabel } from '../../order-display';
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
  note: string;
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

function noteHtml(note: string) {
  if (!note) return '';
  return `<section style="background:#f4faf9;border:1px solid #dcebea;border-radius:18px;padding:18px;margin:22px 0;"><h2 style="font-size:19px;margin:0 0 8px;color:#17345d;">Poznámka k objednávce</h2><p style="margin:0;white-space:pre-wrap;font-size:15px;line-height:1.6;color:#17345d;">${escapeHtml(note)}</p></section>`;
}

function paymentDetails(amount: number, isKladno: boolean) {
  if (isKladno) {
    const paymentText =
      'Odpovědí na tento e-mail nám napište, zda chcete kurz uhradit v hotovosti, bankovním převodem, nebo ve třech splátkách. Platební údaje, výši splátek a termíny úhrady vám potvrdíme e-mailem.';
    return {
      html: `<li style="margin-top:12px;"><strong>Zvolte způsob platby.</strong> ${paymentText} Bez uhrazení ceny kurzu není možné přistoupit k závěrečné zkoušce.</li>`,
      text: [
        `3. Zvolte způsob platby. ${paymentText}`,
        'Bez uhrazení ceny kurzu není možné přistoupit k závěrečné zkoušce.',
      ],
    };
  }
  const splitHtml =
    amount === 25900
      ? '<li>ve třech splátkách: první splátka <strong>8 700 Kč</strong>, druhá splátka <strong>8 600 Kč</strong> a třetí splátka <strong>8 600 Kč</strong>.</li>'
      : '<li>ve splátkách: konkrétní výši jednotlivých splátek s vámi potvrdíme při zápisu.</li>';
  const splitText =
    amount === 25900
      ? 've třech splátkách: první splátka 8 700 Kč, druhá splátka 8 600 Kč a třetí splátka 8 600 Kč.'
      : 've splátkách: konkrétní výši jednotlivých splátek s vámi potvrdíme při zápisu.';
  return {
    html: `<li style="margin-top:12px;"><strong>Rozmyslete si platbu kurzu.</strong> Před zápisem si rozmyslete, jak chcete kurz uhradit. Na zápise nám vybranou možnost řeknete a společně domluvíme další postup.<ul style="margin:10px 0 0;padding-left:22px;"><li>v hotovosti při zápisu,</li><li>bankovním převodem nejpozději do 5 dnů od zápisu,</li>${splitHtml}</ul>Bez uhrazení ceny kurzu není možné přistoupit k závěrečné zkoušce.</li>`,
    text: [
      '3. Rozmyslete si platbu kurzu. Před zápisem si rozmyslete, jak chcete kurz uhradit. Na zápise nám vybranou možnost řeknete a společně domluvíme další postup.',
      'Možnosti platby:',
      '- v hotovosti při zápisu,',
      '- bankovním převodem nejpozději do 5 dnů od zápisu,',
      `- ${splitText}`,
      'Bez uhrazení ceny kurzu není možné přistoupit k závěrečné zkoušce.',
    ],
  };
}

function preparationDetails(applicationFormUrl: string, amount: number, isKladno: boolean) {
  const payment = paymentDetails(amount, isKladno);
  const medicalText = `Zdravotní posudek vydává váš registrující ošetřující lékař, který ho zapíše do EZKarty. Jako autoškola k němu nemáme přístup, proto si ho prosím stáhněte a vytiskněte. Posudek nesmí být ke dni ${isKladno ? 'zahájení výuky' : 'zápisu do autoškoly'} starší než 3 měsíce.`;
  const applicationHtml = isKladno
    ? `Vyplňte první část „Vyplňuje žadatel“ a přihlášku podepište. Kopii nám pošlete odpovědí na tento e-mail. Originál vytiskněte <strong>oboustranně</strong> a vezměte s sebou na první hodinu teorie. Pokud vám ještě není 18 let, přihlášku podepisuje také zákonný zástupce.`
    : `Vyplňte první část „Vyplňuje žadatel“, přihlášku vytiskněte <strong>oboustranně</strong>, vyplňte, podepište a přineste s sebou k zápisu. Pokud vám ještě není 18 let, přihlášku podepisuje také zákonný zástupce.`;
  const applicationText = isKladno
    ? 'Vyplňte první část „Vyplňuje žadatel“ a přihlášku podepište. Kopii nám pošlete odpovědí na tento e-mail. Originál vytiskněte oboustranně a vezměte s sebou na první hodinu teorie. Pokud vám ještě není 18 let, přihlášku podepisuje také zákonný zástupce.'
    : 'Vyplňte první část „Vyplňuje žadatel“, přihlášku vytiskněte oboustranně, vyplňte, podepište a přineste s sebou k zápisu. Pokud vám ještě není 18 let, přihlášku podepisuje také zákonný zástupce.';
  const medicalDelivery = isKladno
    ? 'Posudek nám pošlete odpovědí na tento e-mail a vytištěný originál vezměte na první hodinu teorie.'
    : 'Vytištěný zdravotní posudek přineste společně s přihláškou k zápisu.';
  const preparationTitle = isKladno ? 'Co je potřeba udělat' : 'Co připravit před zápisem';
  return {
    html: `<section style="background:#f4faf9;border:1px solid #dcebea;border-radius:18px;padding:18px;margin:22px 0;"><h2 style="font-size:19px;margin:0 0 12px;color:#17345d;">${preparationTitle}</h2><ol style="padding-left:22px;margin:0;color:#17345d;font-size:15px;line-height:1.7;"><li><strong>Vyplňte přihlášku.</strong> Přihlášku najdete v příloze tohoto e-mailu i na odkazu: <a href="${escapeHtml(applicationFormUrl)}" style="color:#17345d;font-weight:700;">přihláška k výcviku</a>. ${applicationHtml}</li><li style="margin-top:12px;"><strong>Vyřiďte zdravotní posudek.</strong> ${medicalText} ${medicalDelivery}</li>${payment.html}</ol>${isKladno ? '<p style="margin:16px 0 0;font-size:15px;line-height:1.6;color:#17345d;"><strong>Nezapomeňte:</strong> Bez originálu oboustranně vytištěné a podepsané přihlášky a zdravotního posudku není možné zahájit výuku a výcvik.</p>' : ''}</section>`,
    text: [
      `${preparationTitle}:`,
      `1. Vyplňte přihlášku. Přihlášku najdete v příloze tohoto e-mailu i zde: ${applicationFormUrl}. ${applicationText}`,
      `2. Vyřiďte zdravotní posudek. ${medicalText} ${medicalDelivery}`,
      ...payment.text,
      ...(isKladno
        ? [
            'Nezapomeňte: Bez originálu oboustranně vytištěné a podepsané přihlášky a zdravotního posudku není možné zahájit výuku a výcvik.',
          ]
        : []),
    ],
  };
}

export function orderConfirmationEmail(input: CreatedOrderEmailInput): EmailMessage {
  const isKladno = input.selection.branch === 'kladno';
  const appointmentText = input.appointment
    ? formatEmailDateTime(input.appointment.startsAt)
    : 'Termín zápisu zatím není vybraný';
  const isRefresher = input.selection.course === 'kondicni';
  const preparation = isRefresher
    ? {
        html: '<h2>Co připravit</h2><p>Na zápis si vezměte občanský průkaz a platný řidičský průkaz skupiny B. Domluvíme s Vámi platbu a termíny kondičních jízd. Zvolený termín je termín zápisu, nikoli samotné jízdy. Na Kladně Vás pobočka kontaktuje a domluví termín individuálně.</p>',
        text: [
          'Co připravit: občanský průkaz a platný řidičský průkaz skupiny B. Domluvíme s Vámi platbu a termíny kondičních jízd. Zvolený termín je termín zápisu, nikoli samotné jízdy. Na Kladně Vás pobočka kontaktuje a domluví termín individuálně.',
        ],
      }
    : preparationDetails(input.applicationFormUrl, input.price.amount, isKladno);
  const manageLink = input.appointment
    ? ` <a href="${escapeHtml(input.manageUrl)}" style="display:inline-block;color:#17345d;text-decoration:underline;margin-left:12px;font-weight:700;">Změnit termín zápisu</a>`
    : '';
  const body = [
    `<p style="font-size:17px;line-height:1.65;margin:0 0 16px;">Dobrý den, ${escapeHtml(input.contact.firstName)}, děkujeme za objednávku. Níže najdete přehled a ${isKladno ? 'pokyny k zahájení výuky' : 'co je potřeba připravit před zápisem'}.</p>`,
    rows([
      ['Číslo objednávky', input.publicCode],
      ['Kurz', selectionLabel(input.selection)],
      ['Pobočka', branchLabel(input.selection.branch)],
      ['Balíček', packageLabel(input.selection.package)],
      ['Doplňky', addonText(input.addons)],
      ['Celková hodnota objednávky', money(input.price.amount)],
      ...(isKladno
        ? ([['Zahájení výuky', 'Podrobnosti vám zašleme e-mailem.']] as Array<[string, string]>)
        : ([
            ['Termín zápisu', appointmentText],
            ['Adresa zápisu', branchAddress(input.selection.branch)],
          ] as Array<[string, string]>)),
    ]),
    noteHtml(input.note),
    preparation.html,
    `<p style="margin:24px 0;"><a href="${escapeHtml(input.thankYouUrl)}" style="display:inline-block;background:#4daeb6;color:#ffffff;text-decoration:none;padding:13px 18px;border-radius:999px;font-weight:700;">Zobrazit objednávku</a>${manageLink}</p>`,
    ...(isKladno || isRefresher
      ? []
      : [
          `<p style="font-size:15px;line-height:1.6;color:#667998;margin:0;">Na zápis si prosím vezměte občanský průkaz, originál přihlášky a zdravotní posudek.</p>`,
        ]),
  ].join('');
  const text = [
    `Dobrý den, ${input.contact.firstName}, děkujeme za objednávku v Autoškole BuBu.`,
    '',
    `Číslo objednávky: ${input.publicCode}`,
    `Kurz: ${selectionLabel(input.selection)}`,
    `Pobočka: ${branchLabel(input.selection.branch)}`,
    `Balíček: ${packageLabel(input.selection.package)}`,
    `Doplňky: ${addonText(input.addons)}`,
    `Celková hodnota objednávky: ${money(input.price.amount)}`,
    ...(isKladno
      ? ['Zahájení výuky: Podrobnosti vám zašleme e-mailem.']
      : [
          `Termín zápisu: ${appointmentText}`,
          `Adresa zápisu: ${branchAddress(input.selection.branch)}`,
        ]),
    ...(input.note ? ['', 'Poznámka k objednávce:', input.note] : []),
    '',
    ...preparation.text,
    '',
    `Přehled objednávky: ${input.thankYouUrl}`,
    ...(input.appointment ? [`Změna nebo zrušení termínu zápisu: ${input.manageUrl}`] : []),
    '',
  ].join('\n');
  return {
    idempotencyKey: eventKey('order-confirmation', input.orderId),
    eventType: 'order_confirmation',
    orderId: input.orderId,
    appointmentId: input.appointment?.id,
    from: ORDER_FROM,
    replyTo: isKladno ? 'kladno@autoskolabubu.cz' : ORDER_REPLY_TO,
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
  const kladnoNote =
    input.selection.branch === 'kladno'
      ? '<p style="margin:0 0 18px;padding:14px 16px;border-radius:12px;background:#fff4d6;color:#5e4500;font-weight:700;">Kladno: zákazníka kontaktujte a domluvte s ním individuální termín zápisu.</p>'
      : '';
  const body = `${kladnoNote}${rows([
    ['Zákazník', name],
    ['E-mail', input.contact.email],
    ['Telefon', input.contact.phone],
    ['Objednávka', input.publicCode],
    ['Kurz', selectionLabel(input.selection)],
    ['Pobočka', branchLabel(input.selection.branch)],
    ['Balíček', packageLabel(input.selection.package)],
    ['Doplňky', addonText(input.addons)],
    ['Hodnota objednávky', money(input.price.amount)],
    ['Vytvořeno', formatEmailDateTime(input.createdAt)],
    ['Termín zápisu', appointmentText],
  ])}${noteHtml(input.note)}`;
  const text = [
    `Nová objednávka – ${name}`,
    ...(input.selection.branch === 'kladno'
      ? ['Kladno: kontaktujte zákazníka a domluvte individuální termín zápisu.']
      : []),
    `Zákazník: ${name}`,
    `E-mail: ${input.contact.email}`,
    `Telefon: ${input.contact.phone}`,
    `Objednávka: ${input.publicCode}`,
    `Kurz: ${selectionLabel(input.selection)}`,
    `Pobočka: ${branchLabel(input.selection.branch)}`,
    `Balíček: ${packageLabel(input.selection.package)}`,
    `Doplňky: ${addonText(input.addons)}`,
    `Hodnota objednávky: ${money(input.price.amount)}`,
    `Vytvořeno: ${formatEmailDateTime(input.createdAt)}`,
    `Termín zápisu: ${appointmentText}`,
    ...(input.note ? ['', 'Poznámka k objednávce:', input.note] : []),
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
      `Nová objednávka – ${selectionLabel(input.selection)} – ${branchLabel(input.selection.branch)} – ${name}`,
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
      ['Kurz', selectionLabel(input.order.selection)],
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
    text: `${title}\n\nObjednávka: ${input.order.publicCode}\nKurz: ${selectionLabel(input.order.selection)}\nPobočka: ${branchLabel(input.order.selection.branch)}\nAktuální termín: ${isCancelled ? 'zrušený' : appointmentText}\n\nSpráva termínu: ${input.manageUrl}`,
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
  const checklist =
    input.order.selection.course === 'kondicni'
      ? ['občanský průkaz', 'platný řidičský průkaz skupiny B']
      : [
          'oboustranně vytištěnou, vyplněnou a podepsanou přihlášku k výcviku',
          'zdravotní posudek',
          'občanský průkaz',
        ];
  const body = `<p style="font-size:17px;line-height:1.65;margin:0 0 16px;">Dobrý den, ${escapeHtml(input.order.contact.firstName)}, připomínáme váš termín zápisu.</p>${rows(
    [
      ['Objednávka', input.order.publicCode],
      ['Termín', formatEmailDateTime(input.order.appointment.startsAt)],
      ['Pobočka', branchLabel(input.order.appointment.branch)],
      ['Adresa', branchAddress(input.order.appointment.branch)],
    ],
  )}<div style="font-size:16px;line-height:1.65;margin:18px 0;"><strong>Co si nezapomenout vzít k zápisu:</strong><ul style="margin:8px 0 0;padding-left:22px;">${checklist.map((item) => `<li>${escapeHtml(item)}</li>`).join('')}</ul></div><p style="margin:24px 0;"><a href="${escapeHtml(input.manageUrl)}" style="display:inline-block;background:#4daeb6;color:#ffffff;text-decoration:none;padding:13px 18px;border-radius:999px;font-weight:700;">Spravovat termín</a></p>`;
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
    text: `${title}\n\nObjednávka: ${input.order.publicCode}\nTermín: ${formatEmailDateTime(input.order.appointment.startsAt)}\nPobočka: ${branchLabel(input.order.appointment.branch)}\nAdresa: ${branchAddress(input.order.appointment.branch)}\n\nCo si nezapomenout vzít k zápisu:\n${checklist.map((item) => '- ' + item).join('\n')}\n\nSpráva termínu: ${input.manageUrl}`,
    tag: input.kind,
    metadata: {
      publicCode: input.order.publicCode,
      appointmentStartsAt: input.order.appointment.startsAt,
    },
  };
}

export function reportEmail(input: {
  to: string;
  eventType: 'weekly_order_report' | 'monthly_order_report';
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
    reportDate: input.eventType !== 'monthly_order_report' ? input.reportKey : undefined,
    reportMonth: input.eventType === 'monthly_order_report' ? input.reportKey : undefined,
  };
}

export { ORDER_FROM, ORDER_REPLY_TO, monthLabel };
