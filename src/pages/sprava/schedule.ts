import type { APIRoute } from 'astro';
import { z } from 'zod';
import { isDate, pragueToday } from '../../lib/admin-dates';
import { assertSameOrigin, requireLiveRepository } from '../../lib/server/live-order';

export const prerender = false;

const scheduleSchema = z
  .object({
    branch: z.enum(['strizkov', 'statenice']),
    date: z.string().refine(isDate),
    action: z.enum(['close_day', 'open_day', 'add_slot', 'remove_slot', 'restore_slot']),
    start: z
      .string()
      .regex(/^([01]\d|2[0-3]):[0-5]\d$/)
      .optional(),
    slotId: z.uuid().optional(),
    reason: z.string().max(200).optional(),
    returnTo: z.string().optional(),
  })
  .superRefine((value, ctx) => {
    if (value.action === 'add_slot' && !value.start)
      ctx.addIssue({ code: 'custom', message: 'Chybí čas termínu.' });
    if (['remove_slot', 'restore_slot'].includes(value.action) && !value.slotId)
      ctx.addIssue({ code: 'custom', message: 'Chybí termín.' });
  });

export const POST: APIRoute = async ({ request, cookies, redirect }) => {
  try {
    assertSameOrigin(request);
  } catch {
    return new Response('Neplatný požadavek.', { status: 403 });
  }
  const token = cookies.get('bubu_admin_session')?.value;
  if (!token) return new Response('Přihlaste se znovu.', { status: 401 });
  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY)
    return new Response('Správa není dostupná.', { status: 503 });
  const parsed = scheduleSchema.safeParse(Object.fromEntries(await request.formData()));
  if (!parsed.success || parsed.data.date < pragueToday())
    return new Response('Neplatný požadavek.', { status: 400 });
  const repository = requireLiveRepository(process.env);
  const session = await repository.adminSession(token).catch(() => ({ ok: false as const }));
  if (!session.ok) return new Response('Přihlaste se znovu.', { status: 401 });
  const result = await repository
    .adminScheduleAction({
      token,
      branch: parsed.data.branch,
      date: parsed.data.date,
      action: parsed.data.action,
      start: parsed.data.start,
      slotId: parsed.data.slotId,
      reason: parsed.data.reason,
    })
    .catch(() => ({ ok: false, code: 'SERVER_ERROR' }));
  const requested = parsed.data.returnTo ?? '/sprava';
  const destination =
    requested === '/sprava' || (requested.startsWith('/sprava?') && !requested.includes('\\'))
      ? requested
      : '/sprava';
  const url = new URL(destination, request.url);
  url.searchParams.set(
    'scheduleResult',
    result.ok ? parsed.data.action : (result.code ?? 'SERVER_ERROR'),
  );
  return redirect(url.pathname + url.search + '#sprava-terminu', 303);
};
