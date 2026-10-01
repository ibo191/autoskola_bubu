import type { APIRoute } from 'astro';
import { waitUntil } from '@vercel/functions';
import { z } from 'zod';
import { assertSameOrigin, requireLiveRepository } from '../../../../lib/server/live-order';
import { createOrderEmailOutbox } from '../../../../lib/server/email/order-outbox';
import { appointmentChangedEmail } from '../../../../lib/server/email/templates';
import { verifyRecaptcha } from '../../../../lib/server/recaptcha';
import { publicAppOrigin } from '../../../../lib/config';

export const prerender = false;
const bodySchema = z
  .object({ slotId: z.uuid(), recaptchaToken: z.string().max(4096).optional() })
  .strict();

export const POST: APIRoute = async ({ request, params }) => {
  try {
    assertSameOrigin(request);
    const parsed = bodySchema.safeParse(await request.json());
    if (!parsed.success || !params.code) return Response.json({ ok: false }, { status: 400 });
    const captchaValid = await verifyRecaptcha(parsed.data.recaptchaToken, 'reservation', {
      hostname: new URL(request.url).hostname,
    });
    if (!captchaValid) {
      return Response.json(
        {
          ok: false,
          code: 'CAPTCHA_FAILED',
          message: 'Odeslání se nepodařilo. Zkuste to prosím znovu.',
        },
        { status: 403, headers: { 'Cache-Control': 'no-store' } },
      );
    }
    if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY)
      return Response.json({ ok: false, code: 'BOOKING_NOT_CONFIGURED' }, { status: 503 });
    const repository = requireLiveRepository(process.env);
    const result = await repository.rescheduleAppointment({
      publicCode: params.code,
      slotId: parsed.data.slotId,
    });
    let emailQueued = false;
    if (result.ok) {
      try {
        const order = await repository.getPublicOrder(params.code);
        if (!order) throw new Error('Order was not found after rescheduling');
        const manageUrl = new URL('/spravovat-termin', publicAppOrigin(process.env));
        manageUrl.searchParams.set('kod', order.publicCode);
        const confirmedOrder = {
          ...order,
          appointment: {
            id: result.appointmentId,
            branch: order.selection.branch,
            status: 'rescheduled',
            startsAt: result.startsAt,
            endsAt: result.endsAt,
          },
        };
        await createOrderEmailOutbox(process.env, (task) => waitUntil(task)).send(
          appointmentChangedEmail({
            order: confirmedOrder,
            manageUrl: manageUrl.href,
            kind: 'rescheduled',
          }),
        );
        emailQueued = true;
      } catch (error) {
        console.warn('appointment_rescheduled_email_queue_failed', {
          error: error instanceof Error ? error.message : 'unknown',
        });
      }
    }
    return Response.json(result.ok ? { ...result, emailQueued } : result, {
      status: result.ok ? 200 : 422,
      headers: { 'Cache-Control': 'no-store' },
    });
  } catch {
    return Response.json({ ok: false }, { status: 503, headers: { 'Cache-Control': 'no-store' } });
  }
};
