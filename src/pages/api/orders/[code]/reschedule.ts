import type { APIRoute } from 'astro';
import { z } from 'zod';
import { assertSameOrigin, requireLiveRepository } from '../../../../lib/server/live-order';
import { queueRescheduledAppointmentEmail } from '../../../../lib/server/email/rescheduled-appointment';
import { verifyRecaptcha } from '../../../../lib/server/recaptcha';

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
    if (!result.ok)
      return Response.json(result, { status: 422, headers: { 'Cache-Control': 'no-store' } });
    const { revision: _revision, ...publicResult } = result;
    const emailQueued = await queueRescheduledAppointmentEmail(repository, params.code, result);
    return Response.json(
      { ...publicResult, emailQueued },
      {
        headers: { 'Cache-Control': 'no-store' },
      },
    );
  } catch {
    return Response.json({ ok: false }, { status: 503, headers: { 'Cache-Control': 'no-store' } });
  }
};
