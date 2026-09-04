import type { APIRoute } from 'astro';
import { assertSameOrigin, requireLiveRepository } from '../../../../lib/server/live-order';
import {
  createTransactionalEmailAdapter,
  isTransactionalEmailConfigured,
} from '../../../../lib/server/email';
import { appointmentChangedEmail } from '../../../../lib/server/email/templates';

export const prerender = false;

export const POST: APIRoute = async ({ request, params }) => {
  try {
    assertSameOrigin(request);
    if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY)
      return Response.json({ ok: false, code: 'BOOKING_NOT_CONFIGURED' }, { status: 503 });
    if (!params.code) return Response.json({ ok: false }, { status: 400 });
    const repository = requireLiveRepository(process.env);
    const before = await repository.getPublicOrder(params.code);
    const result = await repository.cancelAppointment(params.code);
    if (result.ok && before && isTransactionalEmailConfigured(process.env)) {
      const manageUrl = new URL('/spravovat-termin', new URL(request.url).origin);
      manageUrl.searchParams.set('kod', before.publicCode);
      createTransactionalEmailAdapter(process.env)
        .send(
          appointmentChangedEmail({ order: before, manageUrl: manageUrl.href, kind: 'cancelled' }),
        )
        .catch((error) =>
          console.warn('email_delivery_failed', {
            workflow: 'appointment_cancelled',
            orderId: before.orderId,
            error: error instanceof Error ? error.message : 'unknown',
          }),
        );
    }
    return Response.json(result, {
      status: result.ok ? 200 : 422,
      headers: { 'Cache-Control': 'no-store' },
    });
  } catch {
    return Response.json({ ok: false }, { status: 503, headers: { 'Cache-Control': 'no-store' } });
  }
};
