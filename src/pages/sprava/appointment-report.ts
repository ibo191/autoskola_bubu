import type { APIRoute } from 'astro';
import { assertSameOrigin, requireLiveRepository } from '../../lib/server/live-order';
import {
  appointmentReportBranches,
  processAppointmentDayReports,
} from '../../lib/server/email/workflows';
import { pragueToday } from '../../lib/admin-dates';

export const prerender = false;

export const POST: APIRoute = async ({ request, cookies, redirect }) => {
  try {
    assertSameOrigin(request);
  } catch {
    return new Response('Neplatný požadavek.', { status: 403 });
  }
  const token = cookies.get('bubu_admin_session')?.value;
  if (!token) return new Response('Přihlaste se znovu.', { status: 401 });
  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY)
    return new Response('Správa není dostupná.', { status: 503 });
  const repository = requireLiveRepository(process.env);
  const session = await repository.adminSession(token).catch(() => ({ ok: false as const }));
  if (!session.ok) return new Response('Přihlaste se znovu.', { status: 401 });
  const now = new Date();
  if (!appointmentReportBranches(now).length)
    return new Response('Dnes není zápisový den.', { status: 409 });
  const result = await processAppointmentDayReports(process.env, now, { manual: true }).catch(
    () => ({ ok: false }),
  );
  const url = new URL('/sprava', request.url);
  url.searchParams.set('appointmentDate', pragueToday(now));
  url.searchParams.set('appointmentMonth', pragueToday(now).slice(0, 7));
  url.searchParams.set('reportResult', result.ok ? 'sent' : 'failed');
  const destinationPath = url.pathname + url.search + '#sprava-terminu';
  return request.headers.get('x-admin-async') === '1'
    ? Response.json({ redirectTo: destinationPath })
    : redirect(destinationPath, 303);
};
