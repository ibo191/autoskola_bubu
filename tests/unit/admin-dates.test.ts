import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  isDate,
  orderPeriodRange,
  pragueDayStartUtc,
  pragueToday,
} from '../../src/lib/admin-dates';
import { POST as adminAction } from '../../src/pages/sprava/action';
import { POST as scheduleAction } from '../../src/pages/sprava/schedule';
import type { APIContext } from 'astro';
import { SupabaseBookingRepository } from '../../src/lib/supabase/booking-repository';

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

test('schedule changes reject unauthenticated and cross-origin requests', async () => {
  const body = new URLSearchParams({ branch: 'strizkov', date: '2026-10-05', action: 'close_day' });
  const context = (origin?: string) =>
    ({
      request: new Request('https://www.autoskolabubu.cz/sprava/schedule', {
        method: 'POST',
        body,
        headers: origin ? { origin } : undefined,
      }),
      cookies: { get: () => undefined },
    }) as unknown as APIContext;
  assert.equal((await scheduleAction(context()))?.status, 401);
  assert.equal((await scheduleAction(context('https://example.invalid')))?.status, 403);
});

test('private dashboard batches six views into one service-role request', async () => {
  const originalFetch = globalThis.fetch;
  let called = 0;
  globalThis.fetch = async (input, init) => {
    called += 1;
    assert.equal(String(input), 'https://example.supabase.co/rest/v1/rpc/bubu_admin_dashboard');
    assert.equal(new Headers(init?.headers).get('Authorization'), 'Bearer test-service-key');
    const body = JSON.parse(String(init?.body));
    assert.equal(body.p_appointment_date, '2026-10-05');
    assert.equal(body.p_month, '2026-10-01');
    assert.equal(body.p_schedule_branch, 'strizkov');
    return Response.json({
      summary: {
        ordersTotal: 0,
        ordersConfirmed: 0,
        appointmentsTotal: 0,
        byCourse: [],
        byDay: [],
      },
      orders: [],
      appointments: [],
      nextAppointmentDay: null,
      appointmentDays: [],
      scheduleDay: { closed: false, managedClosure: false, slots: [] },
    });
  };
  try {
    const repository = new SupabaseBookingRepository({
      APP_ENV: 'preview',
      APP_ORIGIN: 'https://preview.example',
      SUPABASE_URL: 'https://example.supabase.co',
      SUPABASE_SERVICE_ROLE_KEY: 'test-service-key',
    });
    const result = await repository.adminDashboard({
      from: '2026-10-01T00:00:00Z',
      to: '2026-11-01T00:00:00Z',
      course: null,
      branch: null,
      status: null,
      query: null,
      limit: 250,
      appointmentDate: '2026-10-05',
      appointmentBranch: null,
      appointmentMonth: '2026-10',
      today: '2026-10-02',
      scheduleBranch: 'strizkov',
    });
    assert.equal(called, 1);
    assert.equal(result.summary.ordersTotal, 0);
    assert.deepEqual(result.scheduleDay.slots, []);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('authorized dashboard rejects an invalid session without returning private data', async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (input, init) => {
    assert.equal(
      String(input),
      'https://example.supabase.co/rest/v1/rpc/bubu_admin_dashboard_authorized',
    );
    assert.equal(JSON.parse(String(init?.body)).p_token, 'expired-token');
    return Response.json({ ok: false });
  };
  try {
    const repository = new SupabaseBookingRepository({
      APP_ENV: 'preview',
      APP_ORIGIN: 'https://preview.example',
      SUPABASE_URL: 'https://example.supabase.co',
      SUPABASE_SERVICE_ROLE_KEY: 'test-service-key',
    });
    const result = await repository.adminDashboardAuthorized('expired-token', {
      from: '2026-10-01T00:00:00Z',
      to: '2026-11-01T00:00:00Z',
      course: null,
      branch: null,
      status: null,
      query: null,
      limit: 250,
      appointmentDate: '2026-10-05',
      appointmentBranch: null,
      appointmentMonth: '2026-10',
      today: '2026-10-02',
      scheduleBranch: 'strizkov',
    });
    assert.deepEqual(result, { ok: false });
  } finally {
    globalThis.fetch = originalFetch;
  }
});
