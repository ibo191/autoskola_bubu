import { test } from 'node:test';
import assert from 'node:assert/strict';
import { generateSlots, pragueToUtc, holdExpired, reminderPlan } from '../../src/lib/booking/slots';
const fixture = {
  date: '2026-08-31',
  open: '15:00',
  close: '18:00',
  durationMinutes: 15,
  capacity: 1,
}; // Fictitious test parameters, not business defaults.
test('Distinct non-overlapping starts cover the opening window', () => {
  const slots = generateSlots(fixture);
  assert.equal(slots.length, 12);
  assert.equal(new Set(slots.map((s) => s.start)).size, 12);
  assert.equal(slots[0]!.start, '2026-08-31T13:00:00.000Z');
  assert.equal(slots.at(-1)!.end, '2026-08-31T16:00:00.000Z');
  for (let i = 1; i < slots.length; i++) assert.ok(slots[i - 1]!.end <= slots[i]!.start);
});
test('Impossible capacity/window is rejected, not silently shortened', () => {
  assert.throws(() => generateSlots({ ...fixture, close: '15:10' }));
  assert.throws(() => generateSlots({ ...fixture, capacity: 0 }));
  assert.throws(() => generateSlots({ ...fixture, open: '26:00' }));
});
test('Blocked intervals remove affected starts without inventing replacements', () => {
  const slots = generateSlots({
    ...fixture,
    blocked: [{ start: '2026-08-31T13:00:00Z', end: '2026-08-31T13:15:00Z' }],
  });
  assert.equal(slots.length, 11);
});
test('Prague summer and winter time and DST boundaries', () => {
  assert.equal(pragueToUtc('2026-01-15', '15:00').toISOString(), '2026-01-15T14:00:00.000Z');
  assert.equal(pragueToUtc('2026-07-15', '15:00').toISOString(), '2026-07-15T13:00:00.000Z');
  assert.throws(() => pragueToUtc('2026-03-29', '02:30'));
  assert.throws(() => pragueToUtc('2026-10-25', '02:30'));
  assert.throws(() => pragueToUtc('2026-02-30', '15:00'));
});
test('Hold expires exactly at boundary', () => {
  assert.equal(holdExpired('2026-08-31T13:00:00Z', new Date('2026-08-31T13:00:00Z')), true);
  assert.equal(holdExpired('2026-08-31T13:00:00Z', new Date('2026-08-31T12:59:59Z')), false);
});
test('Reminders are stable and never schedule a late 24-hour message', () => {
  const early = reminderPlan('o', 'a', '2026-08-31T13:00:00Z', '2026-08-29T13:00:00Z');
  assert.equal(early.length, 2);
  assert.deepEqual(early, reminderPlan('o', 'a', '2026-08-31T13:00:00Z', '2026-08-29T13:00:00Z'));
  assert.equal(reminderPlan('o', 'a', '2026-08-31T13:00:00Z', '2026-08-31T00:00:00Z').length, 1);
  assert.equal(reminderPlan('o', 'a', '2026-08-31T13:00:00Z', '2026-08-31T12:00:00Z').length, 0);
  assert.notEqual(
    early[0]!.key,
    reminderPlan('o', 'a', '2026-09-01T13:00:00Z', '2026-08-29T13:00:00Z')[0]!.key,
  );
});
