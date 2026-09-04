import type { APIRoute } from 'astro';
import { assertCronAuthorized, processEmailReminders } from '../../../lib/server/email/workflows';

export const prerender = false;

export const GET: APIRoute = async ({ request }) => {
  if (!assertCronAuthorized(request, process.env)) {
    return Response.json({ ok: false, code: 'UNAUTHORIZED' }, { status: 401 });
  }
  const result = await processEmailReminders(process.env);
  return Response.json(result, { headers: { 'Cache-Control': 'no-store' } });
};
