import type { APIRoute } from 'astro';
import {
  assertCronAuthorized,
  processAppointmentDayReports,
  processEmailReminders,
} from '../../../lib/server/email/workflows';
import {
  getGroup,
  pendingGroupIds,
  purgeExpiredInvitations,
  sendGroupInvitations,
} from '../../../lib/school-groups';

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
  const schoolGroups = await (async () => {
    try {
      let sent = 0;
      for (const id of await pendingGroupIds(process.env, now)) {
        sent += await sendGroupInvitations(process.env, id);
        const group = await getGroup(process.env, id);
        if (group && now.getTime() - new Date(group.created_at).getTime() >= 48 * 3600000)
          sent += await sendGroupInvitations(process.env, id, true);
      }
      await purgeExpiredInvitations(process.env, now);
      return { ok: true, sent };
    } catch (error) {
      console.error('school_group_reminders_failed', {
        error: error instanceof Error ? error.message : 'unknown',
      });
      return { ok: false };
    }
  })();
  const ok =
    reminders.status === 'fulfilled' &&
    appointmentReports.status === 'fulfilled' &&
    reminders.value.ok &&
    appointmentReports.value.ok &&
    schoolGroups.ok;
  return Response.json(
    {
      ok,
      reminders: reminders.status === 'fulfilled' ? reminders.value : { ok: false },
      appointmentReports:
        appointmentReports.status === 'fulfilled' ? appointmentReports.value : { ok: false },
      schoolGroups,
    },
    { status: ok ? 200 : 503, headers: { 'Cache-Control': 'no-store' } },
  );
};
