import type { APIRoute } from 'astro';
import { motoInterestSchema, saveMotoInterest } from '../../lib/moto-interest';
import { assertSameOrigin, fingerprintRequest } from '../../lib/server/live-order';
import { SupabaseRateLimiter } from '../../lib/supabase/booking-repository';
import { verifyRecaptcha } from '../../lib/server/recaptcha';

export const prerender = false;

export const POST: APIRoute = async ({ request }) => {
  try {
    assertSameOrigin(request);
    if (!request.headers.get('content-type')?.startsWith('application/json'))
      return new Response(null, { status: 415 });
    const text = await request.text();
    if (text.length > 6000) return new Response(null, { status: 413 });
    const parsed = motoInterestSchema.safeParse(JSON.parse(text));
    if (!parsed.success)
      return Response.json({ ok: false, code: 'INVALID_REQUEST' }, { status: 422 });
    if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY)
      return Response.json({ ok: false, code: 'UNAVAILABLE' }, { status: 503 });
    const captchaValid = await verifyRecaptcha(parsed.data.recaptchaToken, 'contact', {
      hostname: new URL(request.url).hostname,
    });
    if (!captchaValid) return Response.json({ ok: false, code: 'CAPTCHA_FAILED' }, { status: 403 });
    const rate = await new SupabaseRateLimiter(process.env).consume({
      scope: 'moto_interest',
      key: fingerprintRequest(request, process.env),
      now: new Date(),
      limit: 5,
      windowMs: 10 * 60 * 1000,
    });
    if (!rate.allowed) return Response.json({ ok: false, code: 'RATE_LIMITED' }, { status: 429 });
    await saveMotoInterest(process.env, parsed.data, new Date());
    return Response.json({ ok: true }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    console.warn('moto_interest_failed', {
      reason: error instanceof Error ? error.message : 'unknown',
    });
    return Response.json(
      { ok: false, code: 'STORAGE_FAILED' },
      {
        status: 503,
        headers: { 'Cache-Control': 'no-store' },
      },
    );
  }
};
