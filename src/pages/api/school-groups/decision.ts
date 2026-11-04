import type { APIRoute } from 'astro';
import { decideMember, memberFromToken } from '../../../lib/school-groups';
import { assertSameOrigin } from '../../../lib/server/live-order';

export const prerender = false;
export const POST: APIRoute = async ({ request }) => {
  try {
    assertSameOrigin(request);
    if (!request.headers.get('content-type')?.startsWith('application/json'))
      return new Response(null, { status: 415 });
    const raw = await request.text();
    if (raw.length > 1500) return new Response(null, { status: 413 });
    const { token, decision } = JSON.parse(raw);
    if (
      typeof token !== 'string' ||
      token.length > 150 ||
      !['confirmed', 'declined'].includes(decision)
    )
      return Response.json({ ok: false }, { status: 422 });
    const pair = await memberFromToken(process.env, token);
    if (!pair) return Response.json({ ok: false, code: 'EXPIRED' }, { status: 404 });
    if (pair.member.confirmation_status === decision)
      return Response.json({ ok: true }, { headers: { 'Cache-Control': 'no-store' } });
    if (pair.member.confirmation_status !== 'invited' || pair.member.existing_order_id)
      return Response.json({ ok: false, code: 'ALREADY_DECIDED' }, { status: 409 });
    const updated = await decideMember(process.env, pair.member.id, decision);
    return Response.json(
      { ok: updated },
      { status: updated ? 200 : 409, headers: { 'Cache-Control': 'no-store' } },
    );
  } catch {
    return Response.json({ ok: false }, { status: 503, headers: { 'Cache-Control': 'no-store' } });
  }
};
