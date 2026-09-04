import type { APIRoute } from 'astro';
import { assertCronAuthorized, processDailyReport } from '../../../lib/server/email/workflows';
import { pragueHour } from '../../../lib/server/email/utils';

export const prerender = false;

export const GET: APIRoute = async ({ request }) => {
  if (!assertCronAuthorized(request, process.env)) {
    return Response.json({ ok: false, code: 'UNAUTHORIZED' }, { status: 401 });
  }
  const now = new Date();
  if (pragueHour(now) !== 7) {
    return Response.json(
      { ok: true, skipped: 'outside-prague-7am' },
      { headers: { 'Cache-Control': 'no-store' } },
    );
  }
  const result = await processDailyReport(process.env, now);
  return Response.json(result, { headers: { 'Cache-Control': 'no-store' } });
};
