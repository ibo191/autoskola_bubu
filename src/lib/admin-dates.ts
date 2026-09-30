export type OrderPeriod = 'this-month' | 'last-month' | 'last-three-months';

export function pragueToday(now = new Date()) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Prague',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now);
}

function monthStart(year: number, month: number, offset = 0) {
  return new Date(Date.UTC(year, month - 1 + offset, 1)).toISOString().slice(0, 10);
}

function monthEnd(year: number, month: number, offset = 0) {
  return new Date(Date.UTC(year, month + offset, 0)).toISOString().slice(0, 10);
}

export function orderPeriodRange(period: OrderPeriod, today: string) {
  const year = Number(today.slice(0, 4));
  const month = Number(today.slice(5, 7));
  if (period === 'last-month') {
    return { from: monthStart(year, month, -1), to: monthEnd(year, month, -1) };
  }
  if (period === 'last-three-months') {
    return { from: monthStart(year, month, -2), to: monthEnd(year, month) };
  }
  return { from: monthStart(year, month), to: monthEnd(year, month) };
}

export function isDate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

export function pragueDayStartUtc(date: string) {
  const utcMidnight = new Date(`${date}T00:00:00.000Z`);
  const zone = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Europe/Prague',
    timeZoneName: 'shortOffset',
  })
    .formatToParts(utcMidnight)
    .find((part) => part.type === 'timeZoneName')?.value;
  const match = /^GMT([+-])(\d{1,2})(?::(\d{2}))?$/.exec(zone ?? '');
  if (!match) throw new Error('Cannot determine Prague timezone offset');
  const offsetMinutes =
    (Number(match[2]) * 60 + Number(match[3] ?? 0)) * (match[1] === '+' ? 1 : -1);
  return new Date(utcMidnight.getTime() - offsetMinutes * 60000).toISOString();
}
