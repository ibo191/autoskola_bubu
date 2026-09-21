/** Střížkov appointments are intentionally offered from this date onward. */
export const strizkovEnrollmentStartDate = '2026-10-01';

const pragueDate = new Intl.DateTimeFormat('sv-SE', {
  timeZone: 'Europe/Prague',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

export function isEnrollmentSlotOpen(branch: string, startsAt: string) {
  if (branch !== 'strizkov') return true;
  const date = new Date(startsAt);
  return Number.isFinite(date.getTime()) && pragueDate.format(date) >= strizkovEnrollmentStartDate;
}

export function firstBookingMonth(branch: string, now = new Date()) {
  const current = new Date(now.getFullYear(), now.getMonth(), 1);
  if (branch !== 'strizkov') return current;
  const start = new Date(`${strizkovEnrollmentStartDate}T00:00:00`);
  return current < start ? start : current;
}
