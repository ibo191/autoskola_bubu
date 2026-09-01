import type { APIRoute } from 'astro';
import { requireLiveRepository } from '../../../../lib/server/live-order';
import { branchLabel, courseLabel } from '../../../../lib/order-display';

export const prerender = false;

function icsDate(value: string) {
  return new Date(value)
    .toISOString()
    .replace(/[-:]/g, '')
    .replace(/\.\d{3}Z$/, 'Z');
}
function escapeIcs(value: string) {
  return value
    .replaceAll('\\', '\\\\')
    .replaceAll(',', '\\,')
    .replaceAll(';', '\\;')
    .replaceAll('\n', '\\n');
}

export const GET: APIRoute = async ({ params }) => {
  try {
    if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY || !params.code)
      return new Response('Not found', { status: 404 });
    const order = await requireLiveRepository(process.env).getPublicOrder(params.code);
    if (!order?.appointment) return new Response('Not found', { status: 404 });
    const summary = `Zápis do Autoškoly BuBu – ${courseLabel(order.selection.course)}`;
    const description = `Číslo objednávky: ${order.publicCode}\nPři zápisu se platí nevratná záloha za kurz 5 000 Kč na pobočce, ideálně v hotovosti, případně okamžitým převodem na účet.`;
    const body = [
      'BEGIN:VCALENDAR',
      'VERSION:2.0',
      'PRODID:-//Autoškola BuBu//Objednávka//CS',
      'CALSCALE:GREGORIAN',
      'BEGIN:VEVENT',
      `UID:${order.publicCode}@autoskolabubu.cz`,
      `DTSTAMP:${icsDate(new Date().toISOString())}`,
      `DTSTART:${icsDate(order.appointment.startsAt)}`,
      `DTEND:${icsDate(order.appointment.endsAt)}`,
      `SUMMARY:${escapeIcs(summary)}`,
      `LOCATION:${escapeIcs(branchLabel(order.appointment.branch))}`,
      `DESCRIPTION:${escapeIcs(description)}`,
      'END:VEVENT',
      'END:VCALENDAR',
    ].join('\r\n');
    return new Response(body, {
      headers: {
        'Content-Type': 'text/calendar; charset=utf-8',
        'Content-Disposition': `attachment; filename="${order.publicCode}.ics"`,
        'Cache-Control': 'no-store',
      },
    });
  } catch {
    return new Response('Calendar export failed', { status: 503 });
  }
};
