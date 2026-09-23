import type { APIRoute } from 'astro';
import { assertCronAuthorized } from '../../../lib/server/email/workflows';
import { createOrderEmailOutbox } from '../../../lib/server/email/order-outbox';

export const prerender = false;

export const GET: APIRoute = async ({ request }) => {
  if (!assertCronAuthorized(request, process.env)) {
    return Response.json({ ok: false, code: 'UNAUTHORIZED' }, { status: 401 });
  }
  try {
    const result = await createOrderEmailOutbox(process.env).drainDue();
    return Response.json({ ok: true, ...result }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    console.error('order_email_outbox_failed', {
      error: error instanceof Error ? error.message : 'unknown',
    });
    return Response.json(
      { ok: false, code: 'OUTBOX_FAILED' },
      { status: 503, headers: { 'Cache-Control': 'no-store' } },
    );
  }
};
