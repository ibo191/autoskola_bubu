import type { APIRoute } from 'astro';
import { assertSameOrigin, requireLiveRepository } from '../../../../lib/server/live-order';

export const prerender = false;

export const POST: APIRoute = async ({ request, params }) => {
  try {
    assertSameOrigin(request);
    if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY)
      return Response.json({ ok: false, code: 'BOOKING_NOT_CONFIGURED' }, { status: 503 });
    if (!params.code) return Response.json({ ok: false }, { status: 400 });
    const result = await requireLiveRepository(process.env).cancelAppointment(params.code);
    return Response.json(result, {
      status: result.ok ? 200 : 422,
      headers: { 'Cache-Control': 'no-store' },
    });
  } catch {
    return Response.json({ ok: false }, { status: 503, headers: { 'Cache-Control': 'no-store' } });
  }
};
