import type { APIRoute } from 'astro';
import { waitUntil } from '@vercel/functions';
import { assertSameOrigin, requireLiveRepository } from '../../../../lib/server/live-order';
import {
  createOrderEmailOutbox,
  orderEmailMetadata,
} from '../../../../lib/server/email/order-outbox';
import {
  appointmentChangedEmail,
  cancellationFollowUpEmail,
} from '../../../../lib/server/email/templates';
import { cancellationReasonCodes } from '../../../../lib/booking/cancellation-reasons';
import { z } from 'zod';
import { verifyRecaptcha } from '../../../../lib/server/recaptcha';
import { publicAppOrigin } from '../../../../lib/config';

export const prerender = false;
const bodySchema = z
  .object({
    recaptchaToken: z.string().max(4096).optional(),
    reason: z.enum(cancellationReasonCodes),
    reasonDetail: z.string().trim().max(500).optional(),
    revision: z.number().int().positive(),
  })
  .strict()
  .superRefine((value, context) => {
    if (value.reason === 'other' && !value.reasonDetail) {
      context.addIssue({
        code: 'custom',
        path: ['reasonDetail'],
        message: 'Upřesněte důvod zrušení.',
      });
    }
  });

export const POST: APIRoute = async ({ request, params }) => {
  try {
    assertSameOrigin(request);
    if (!params.code) return Response.json({ ok: false }, { status: 400 });
    const parsed = bodySchema.safeParse(await request.json());
    if (!parsed.success) return Response.json({ ok: false }, { status: 400 });
    const captchaValid = await verifyRecaptcha(parsed.data.recaptchaToken, 'reservation', {
      env: process.env,
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
    const before = await repository.getPublicOrder(params.code);
    if (!before || before.appointment?.revision !== parsed.data.revision) {
      return Response.json(
        { ok: false },
        { status: 409, headers: { 'Cache-Control': 'no-store' } },
      );
    }
    const manageUrl = new URL('/spravovat-termin', publicAppOrigin(process.env));
    manageUrl.searchParams.set('kod', before.publicCode);
    const followUp =
      parsed.data.reason === 'no_longer_interested'
        ? null
        : cancellationFollowUpEmail({
            order: before,
            manageUrl: manageUrl.href,
            revision: parsed.data.revision + 1,
          });
    const result = await repository.customerCancelAppointment(
      params.code,
      parsed.data.reason,
      parsed.data.revision,
      followUp && {
        idempotencyKey: followUp.idempotencyKey,
        subject: followUp.subject,
        metadata: orderEmailMetadata(followUp),
      },
      parsed.data.reason === 'other' ? parsed.data.reasonDetail : undefined,
    );
    if (!result.ok) {
      return Response.json(result, { status: 409, headers: { 'Cache-Control': 'no-store' } });
    }
    let emailQueued = false;
    try {
      await createOrderEmailOutbox(process.env, (task) => waitUntil(task)).send(
        appointmentChangedEmail({
          order: before,
          manageUrl: manageUrl.href,
          kind: 'cancelled',
          revision: result.revision,
          canRebook: result.canRebook,
        }),
      );
      emailQueued = true;
    } catch (error) {
      console.warn('appointment_cancelled_email_queue_failed', {
        error: error instanceof Error ? error.message : 'unknown',
      });
    }
    return Response.json(
      { ok: true, emailQueued, canRebook: result.canRebook },
      {
        headers: { 'Cache-Control': 'no-store' },
      },
    );
  } catch {
    return Response.json({ ok: false }, { status: 503, headers: { 'Cache-Control': 'no-store' } });
  }
};
