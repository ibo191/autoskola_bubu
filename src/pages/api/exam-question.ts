import { randomUUID } from 'node:crypto';
import type { APIRoute } from 'astro';
import { examQuestionSchema } from '../../lib/exam-question';
import { assertSameOrigin, fingerprintRequest } from '../../lib/server/live-order';
import {
  createTransactionalEmailAdapter,
  isTransactionalEmailConfigured,
} from '../../lib/server/email';
import {
  examQuestionConfirmationEmail,
  examQuestionNotificationEmail,
} from '../../lib/server/email/templates';
import { verifyRecaptcha } from '../../lib/server/recaptcha';
import { SupabaseRateLimiter } from '../../lib/supabase/booking-repository';

export const prerender = false;

const failure = () =>
  Response.json(
    { ok: false, message: 'Dotaz se nepodařilo odeslat. Zkuste to prosím znovu.' },
    { status: 503, headers: { 'Cache-Control': 'no-store' } },
  );

export const POST: APIRoute = async ({ request }) => {
  try {
    assertSameOrigin(request);
    if (!request.headers.get('content-type')?.startsWith('application/json')) {
      return Response.json({ ok: false }, { status: 415 });
    }
    const raw = await request.text();
    if (raw.length > 8000) return Response.json({ ok: false }, { status: 413 });
    const parsed = examQuestionSchema.safeParse(JSON.parse(raw));
    if (!parsed.success) return Response.json({ ok: false }, { status: 422 });

    if (!isTransactionalEmailConfigured(process.env)) return failure();
    const limiter = new SupabaseRateLimiter(process.env);
    const rate = await limiter.consume({
      scope: 'exam_contact',
      key: fingerprintRequest(request, process.env),
      now: new Date(),
      limit: 5,
      windowMs: 60 * 60 * 1000,
    });
    if (!rate.allowed) return Response.json({ ok: false }, { status: 429 });

    if (
      !(await verifyRecaptcha(parsed.data.recaptchaToken, 'exam_contact', {
        hostname: new URL(request.url).hostname,
      }))
    ) {
      return Response.json({ ok: false }, { status: 403 });
    }

    const submissionId = randomUUID();
    const email = createTransactionalEmailAdapter(process.env);
    await email.send(examQuestionNotificationEmail({ ...parsed.data, submissionId }));
    await email.send(examQuestionConfirmationEmail({ submissionId, to: parsed.data.email }));
    return Response.json({ ok: true }, { headers: { 'Cache-Control': 'no-store' } });
  } catch {
    console.warn('exam_question_failed');
    return failure();
  }
};
