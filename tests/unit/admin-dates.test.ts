import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  isDate,
  orderPeriodRange,
  pragueDayStartUtc,
  pragueToday,
} from '../../src/lib/admin-dates';
import { POST as adminAction } from '../../src/pages/sprava/action';
import type { APIContext } from 'astro';

test('admin order presets use Prague calendar months across the year boundary', () => {
  assert.deepEqual(orderPeriodRange('this-month', '2026-01-15'), {
    from: '2026-01-01',
    to: '2026-01-31',
  });
  assert.deepEqual(orderPeriodRange('last-month', '2026-01-15'), {
    from: '2025-12-01',
    to: '2025-12-31',
  });
  assert.deepEqual(orderPeriodRange('last-three-months', '2026-01-15'), {
    from: '2025-11-01',
    to: '2026-01-31',
  });
  assert.equal(pragueToday(new Date('2026-09-29T22:30:00Z')), '2026-09-30');
  assert.equal(isDate('2026-02-30'), false);
  assert.equal(pragueDayStartUtc('2026-03-29'), '2026-03-28T23:00:00.000Z');
  assert.equal(pragueDayStartUtc('2026-03-30'), '2026-03-29T22:00:00.000Z');
  assert.equal(pragueDayStartUtc('2026-10-25'), '2026-10-24T22:00:00.000Z');
  assert.equal(pragueDayStartUtc('2026-10-26'), '2026-10-25T23:00:00.000Z');
});

test('admin order action rejects unauthenticated and cross-origin requests', async () => {
  const body = new URLSearchParams({
    orderId: '11111111-1111-4111-8111-111111111111',
    intent: 'attend',
  });
  const context = (origin?: string) =>
    ({
      request: new Request('https://www.autoskolabubu.cz/sprava/action', {
        method: 'POST',
        body,
        headers: origin ? { origin } : undefined,
      }),
      cookies: { get: () => undefined },
    }) as unknown as APIContext;
  assert.equal((await adminAction(context()))?.status, 401);
  assert.equal((await adminAction(context('https://example.invalid')))?.status, 403);
});
