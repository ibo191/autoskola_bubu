import type { APIRoute } from 'astro';
import { z } from 'zod';
import { assertSameOrigin, requireLiveRepository } from '../../../../lib/server/live-order';
import {
  createTransactionalEmailAdapter,
  isTransactionalEmailConfigured,
} from '../../../../lib/server/email';
import { appointmentChangedEmail } from '../../../../lib/server/email/templates';

export const prerender = false;
const bodySchema = z.object({ slotId: z.uuid() }).strict();

export const POST: APIRoute = async ({ request, params }) => {
  try {
    assertSameOrigin(request);
    if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY)
      return Response.json({ ok: false, code: 'BOOKING_NOT_CONFIGURED' }, { status: 503 });
    const parsed = bodySchema.safeParse(await request.json());
    if (!parsed.success || !params.code) return Response.json({ ok: false }, { status: 400 });
    const repository = requireLiveRepository(process.env);
    const result = await repository.rescheduleAppointment({
      publicCode: params.code,
      slotId: parsed.data.slotId,
    });
    if (result.ok && isTransactionalEmailConfigured(process.env)) {
      const order = await repository.getPublicOrder(params.code);
      if (order) {
        const manageUrl = new URL('/spravovat-termin', new URL(request.url).origin);
        manageUrl.searchParams.set('kod', order.publicCode);
        createTransactionalEmailAdapter(process.env)
          .send(appointmentChangedEmail({ order, manageUrl: manageUrl.href, kind: 'rescheduled' }))
          .catch((error) =>
            console.warn('email_delivery_failed', {
              workflow: 'appointment_rescheduled',
              orderId: order.orderId,
              error: error instanceof Error ? error.message : 'unknown',
            }),
          );
      }
    }
    return Response.json(result, {
      status: result.ok ? 200 : 422,
      headers: { 'Cache-Control': 'no-store' },
    });
  } catch {
    return Response.json({ ok: false }, { status: 503, headers: { 'Cache-Control': 'no-store' } });
  }
};
