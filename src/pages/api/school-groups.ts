import type { APIRoute } from 'astro';
import { createGroup, groupSchema, sendGroupInvitations } from '../../lib/school-groups';
import { assertSameOrigin, fingerprintRequest } from '../../lib/server/live-order';
import { SupabaseRateLimiter } from '../../lib/supabase/booking-repository';
import { verifyRecaptcha } from '../../lib/server/recaptcha';
import { isTransactionalEmailConfigured } from '../../lib/server/email';

export const prerender = false;
export const POST: APIRoute = async ({ request }) => {
  try {
    assertSameOrigin(request);
    if (!request.headers.get('content-type')?.startsWith('application/json'))
      return new Response(null, { status: 415 });
    const raw = await request.text();
    if (raw.length > 12000) return new Response(null, { status: 413 });
    const parsed = groupSchema.safeParse(JSON.parse(raw));
    if (!parsed.success)
      return Response.json({ ok: false, code: 'INVALID_REQUEST' }, { status: 422 });
    if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY)
      return Response.json({ ok: false, code: 'UNAVAILABLE' }, { status: 503 });
    const production =
      process.env.VERCEL_ENV === 'production' || process.env.APP_ENV === 'production';
    if (production && !isTransactionalEmailConfigured(process.env))
      return Response.json({ ok: false, code: 'EMAIL_UNAVAILABLE' }, { status: 503 });
    const captcha = production
      ? await verifyRecaptcha(parsed.data.recaptchaToken, 'order', {
          hostname: new URL(request.url).hostname,
        })
      : parsed.data.recaptchaToken === 'preview-order-submission';
    if (!captcha) return Response.json({ ok: false, code: 'CAPTCHA_FAILED' }, { status: 403 });
    const rate = await new SupabaseRateLimiter(process.env).consume({
      scope: 'school_group',
      key: fingerprintRequest(request, process.env),
      now: new Date(),
      limit: 2,
      windowMs: 60 * 60 * 1000,
    });
    if (!rate.allowed) return Response.json({ ok: false, code: 'RATE_LIMITED' }, { status: 429 });
    let attributionAllowed = false;
    try {
      const cookie = request.headers
        .get('cookie')
        ?.split('; ')
        .find((part) => part.startsWith('bubu_cookie_consent='));
      const consent =
        cookie && JSON.parse(decodeURIComponent(cookie.slice('bubu_cookie_consent='.length + 1)));
      attributionAllowed = consent?.version === 1 && consent.marketing === true;
    } catch {
      /* No consent on malformed cookie. */
    }
    const attribution = parsed.data.attribution;
    if (attributionAllowed && attribution) {
      const landing = new URL(attribution.landingPage);
      const requestOrigin = new URL(request.url).origin;
      attributionAllowed =
        landing.origin === requestOrigin &&
        !landing.search &&
        !landing.hash &&
        Date.parse(attribution.firstClickAt) <= Date.now() + 5 * 60_000 &&
        Date.parse(attribution.firstClickAt) >= Date.now() - 90 * 86400000 &&
        Date.parse(attribution.consentAt) <= Date.now() + 5 * 60_000;
    }
    const group = await createGroup(process.env, parsed.data, attributionAllowed);
    const invitationsSent = await sendGroupInvitations(process.env, group.id);
    return Response.json(
      { ok: true, groupId: group.id, invitationsSent },
      { headers: { 'Cache-Control': 'no-store' } },
    );
  } catch (error) {
    console.error('school_group_submission_failed', {
      reason: error instanceof Error ? error.message : 'unknown',
    });
    return Response.json(
      { ok: false, code: 'STORAGE_FAILED' },
      { status: 503, headers: { 'Cache-Control': 'no-store' } },
    );
  }
};
