import type { APIRoute } from 'astro';
import { z } from 'zod';
import { assertSameOrigin, requireLiveRepository } from '../../lib/server/live-order';

export const prerender = false;

const actionSchema = z.object({
  orderId: z.uuid(),
  intent: z.enum(['attend', 'cancel']),
  returnTo: z.string().optional(),
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
  const parsed = actionSchema.safeParse(Object.fromEntries(await request.formData()));
  if (!parsed.success) return new Response('Neplatný požadavek.', { status: 400 });
  const repository = requireLiveRepository(process.env);
  const session = await repository.adminSession(token).catch(() => ({ ok: false as const }));
  if (!session.ok) return new Response('Přihlaste se znovu.', { status: 401 });
  const result = await repository
    .adminOrderAction(token, parsed.data.orderId, parsed.data.intent)
    .catch(() => ({ ok: false }));
  if (!result.ok)
    return new Response('Akci se nepodařilo provést. Obnovte stránku a zkuste to znovu.', {
      status: 409,
    });
  const requested = parsed.data.returnTo ?? '/sprava';
  const destination =
    requested === '/sprava' || (requested.startsWith('/sprava?') && !requested.includes('\\'))
      ? requested
      : '/sprava';
  const url = new URL(destination, request.url);
  url.searchParams.set('actionResult', parsed.data.intent === 'attend' ? 'attended' : 'cancelled');
  return redirect(url.pathname + url.search, 303);
};
