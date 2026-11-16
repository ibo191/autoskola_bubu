import type { APIRoute } from 'astro';
import { z } from 'zod';
import { assertSameOrigin, requireLiveRepository } from '../../lib/server/live-order';
import { queueRescheduledAppointmentEmail } from '../../lib/server/email/rescheduled-appointment';

export const prerender = false;

const formSchema = z.object({
  orderId: z.uuid(),
  slotId: z.uuid(),
  expectedStartsAt: z.iso.datetime({ offset: true }),
  returnTo: z.string().optional(),
});

export const POST: APIRoute = async ({ request, cookies, redirect }) => {
  try {
    assertSameOrigin(request);
  } catch {
    return new Response('Neplatný požadavek.', { status: 403 });
  }
  const token = cookies.get('bubu_admin_session')?.value;
  if (!token) return new Response('Přihlaste se znovu.', { status: 401 });
  const form = await request.formData().catch(() => null);
  const parsed = formSchema.safeParse(form && Object.fromEntries(form));
  if (!parsed.success) return new Response('Vyberte nový termín zápisu.', { status: 400 });

  try {
    const repository = requireLiveRepository(process.env);
    const result = await repository.adminRescheduleAppointment(token, parsed.data);
    if (!result.ok) {
      if (result.reason === 'unauthorized')
        return new Response('Přihlaste se znovu.', { status: 401 });
      return new Response(
        'Termín už není volný nebo se zápis mezitím změnil. Obnovte přehled a vyberte termín znovu.',
        { status: 409 },
      );
    }
    const emailQueued = await queueRescheduledAppointmentEmail(
      repository,
      result.publicCode,
      result,
    );
    const requested = parsed.data.returnTo ?? '/sprava';
    const destination = new URL(
      requested === '/sprava' || (requested.startsWith('/sprava?') && !requested.includes('\\'))
        ? requested
        : '/sprava',
      request.url,
    );
    destination.searchParams.set('actionResult', emailQueued ? 'rescheduled' : 'email_failed');
    const redirectTo = destination.pathname + destination.search;
    return request.headers.get('x-admin-async') === '1'
      ? Response.json({ redirectTo })
      : redirect(redirectTo, 303);
  } catch (error) {
    console.error('admin_reschedule_failed', error);
    return new Response('Přeplánování se nepodařilo uložit.', { status: 503 });
  }
};
