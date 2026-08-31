import { z } from 'zod';
export const scheduleSchema = z
  .object({
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    open: z.string().regex(/^\d{2}:\d{2}$/),
    close: z.string().regex(/^\d{2}:\d{2}$/),
    durationMinutes: z.number().int().positive(),
    capacity: z.number().int().positive(),
    blocked: z.array(z.object({ start: z.iso.datetime(), end: z.iso.datetime() })).default([]),
  })
  .strict();
export type Slot = { start: string; end: string; capacity: number };
const formatter = new Intl.DateTimeFormat('sv-SE', {
  timeZone: 'Europe/Prague',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
});
/** Reject impossible or ambiguous wall times instead of silently shifting the appointment. */
export function pragueToUtc(date: string, time: string): Date {
  const target = `${date} ${time}`;
  const guess = Date.parse(`${date}T${time}:00Z`);
  if (!Number.isFinite(guess)) throw new Error('Invalid date');
  const matches = [1, 2]
    .map((offset) => new Date(guess - offset * 3600000))
    .filter((d) => formatter.format(d) === target);
  if (matches.length !== 1) throw new Error('Nonexistent or ambiguous Prague wall time');
  return matches[0]!;
}
function minuteOfDay(time: string) {
  const [h, m] = time.split(':').map(Number);
  if (h! > 23 || m! > 59) throw new Error('Invalid time');
  return h! * 60 + m!;
}
export function generateSlots(input: unknown): Slot[] {
  const s = scheduleSchema.parse(input);
  const start = minuteOfDay(s.open),
    end = minuteOfDay(s.close);
  const span = end - start - s.durationMinutes;
  if (span < 9 * s.durationMinutes)
    throw new Error('Opening window cannot fit ten non-overlapping appointments');
  const output: Slot[] = [];
  for (let i = 0; i < 10; i++) {
    const minute = start + Math.floor((span * i) / 9);
    const time = `${Math.floor(minute / 60)
      .toString()
      .padStart(2, '0')}:${(minute % 60).toString().padStart(2, '0')}`;
    const from = pragueToUtc(s.date, time),
      to = new Date(from.getTime() + s.durationMinutes * 60000);
    if (
      s.blocked.some(
        (b) => Date.parse(b.start) < to.getTime() && Date.parse(b.end) > from.getTime(),
      )
    )
      continue;
    output.push({ start: from.toISOString(), end: to.toISOString(), capacity: s.capacity });
  }
  return output;
}
export const holdExpired = (expiresAt: string, now: Date) => Date.parse(expiresAt) <= now.getTime();
export function reminderPlan(
  orderId: string,
  appointmentId: string,
  start: string,
  confirmedAt: string,
) {
  const beginning = Date.parse(start),
    confirmed = Date.parse(confirmedAt);
  return [24, 2]
    .map((hours) => ({
      key: `${orderId}:${appointmentId}:${start}:${hours}h`,
      dueAt: new Date(beginning - hours * 3600000).toISOString(),
      hours,
    }))
    .filter((job) => Date.parse(job.dueAt) > confirmed);
}
