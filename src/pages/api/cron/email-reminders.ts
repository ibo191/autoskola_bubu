import type { APIRoute } from 'astro';
import {
  assertCronAuthorized,
  processAppointmentDayReports,
  processEmailReminders,
} from '../../../lib/server/email/workflows';

export const prerender = false;

export const GET: APIRoute = async ({ request }) => {
  if (!assertCronAuthorized(request, process.env)) {
    return Response.json({ ok: false, code: 'UNAUTHORIZED' }, { status: 401 });
  }
  const now = new Date();
  const [reminders, appointmentReports] = await Promise.allSettled([
    processEmailReminders(process.env, now),
    processAppointmentDayReports(process.env, now),
  ]);
  const ok =
    reminders.status === 'fulfilled' &&
    appointmentReports.status === 'fulfilled' &&
    reminders.value.ok &&
    appointmentReports.value.ok;
  return Response.json(
    {
      ok,
      reminders: reminders.status === 'fulfilled' ? reminders.value : { ok: false },
      appointmentReports:
        appointmentReports.status === 'fulfilled' ? appointmentReports.value : { ok: false },
    },
    { status: ok ? 200 : 503, headers: { 'Cache-Control': 'no-store' } },
  );
};
