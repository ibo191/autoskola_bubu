import { createHash } from 'node:crypto';

const czechDate = new Intl.DateTimeFormat('cs-CZ', {
  timeZone: 'Europe/Prague',
  day: 'numeric',
  month: 'long',
  year: 'numeric',
});

const czechDateTime = new Intl.DateTimeFormat('cs-CZ', {
  timeZone: 'Europe/Prague',
  weekday: 'long',
  day: 'numeric',
  month: 'long',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
});

export function escapeHtml(value: unknown) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

export function stripHeader(value: string) {
  return value
    .replace(/[\r\n]+/g, ' ')
    .trim()
    .slice(0, 254);
}

export function eventKey(...parts: Array<string | number | null | undefined>) {
  const raw = parts.map((part) => String(part ?? '')).join(':');
  const digest = createHash('sha256').update(raw).digest('hex').slice(0, 18);
  return `${String(parts[0] ?? 'email')}-${digest}`;
}

export function toPragueDate(value: Date | string) {
  const date = typeof value === 'string' ? new Date(value) : value;
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Prague',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

export function pragueHour(value: Date) {
  const hour = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Europe/Prague',
    hour: '2-digit',
    hour12: false,
  }).format(value);
  return Number(hour);
}

export function formatEmailDate(value: Date | string) {
  return czechDate.format(typeof value === 'string' ? new Date(value) : value);
}

export function formatEmailDateTime(value: Date | string) {
  return czechDateTime.format(typeof value === 'string' ? new Date(value) : value);
}

export function addDaysToLocalDate(localDate: string, days: number) {
  const date = new Date(`${localDate}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

export function monthLabel(month: string) {
  const [yearText, monthText] = month.split('-');
  const year = Number(yearText);
  const monthNumber = Number(monthText || '1');
  return new Intl.DateTimeFormat('cs-CZ', { month: 'long', year: 'numeric' }).format(
    new Date(
      Date.UTC(
        Number.isFinite(year) ? year : 1970,
        (Number.isFinite(monthNumber) ? monthNumber : 1) - 1,
        1,
      ),
    ),
  );
}
