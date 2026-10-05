import type { APIRoute } from 'astro';
import { waitUntil } from '@vercel/functions';
import { z } from 'zod';
import { publicAppOrigin } from '../../lib/config';
import { assertSameOrigin, requireLiveRepository } from '../../lib/server/live-order';
import { isTransactionalEmailConfigured } from '../../lib/server/email';
import { createOrderEmailOutbox } from '../../lib/server/email/order-outbox';
import { adminEnrollmentEmail, noShowFollowUpEmail } from '../../lib/server/email/templates';

export const prerender = false;

const actionSchema = z.object({
  orderId: z.uuid(),
  intent: z.enum(['attend', 'cancel', 'no_show']),
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
  if (!isTransactionalEmailConfigured(process.env))
    return new Response('E-mailová služba není dostupná.', { status: 503 });
  const parsed = actionSchema.safeParse(Object.fromEntries(await request.formData()));
  if (!parsed.success) return new Response('Neplatný požadavek.', { status: 400 });
  const repository = requireLiveRepository(process.env);
  const session = await repository.adminSession(token).catch(() => ({ ok: false as const }));
  if (!session.ok) return new Response('Přihlaste se znovu.', { status: 401 });
  const result = await repository
    .adminOrderAction(token, parsed.data.orderId, parsed.data.intent)
    .catch(() => ({
      ok: false,
      recipient: undefined,
      publicCode: undefined,
      appointmentId: undefined,
      course: undefined,
    }));
  if (!result.ok)
    return new Response('Akci se nepodařilo provést. Obnovte stránku a zkuste to znovu.', {
      status: 409,
    });
  let emailQueued = false;
  if (result.recipient && result.publicCode && (parsed.data.intent !== 'attend' || result.course)) {
    try {
      const email = adminEnrollmentEmail({
        orderId: parsed.data.orderId,
        appointmentId: result.appointmentId,
        publicCode: result.publicCode,
        to: result.recipient,
        action: parsed.data.intent,
        course: result.course,
        origin: publicAppOrigin(process.env),
      });
      const outbox = createOrderEmailOutbox(process.env, (task) => waitUntil(task));
      await outbox.send(email);
      if (parsed.data.intent === 'no_show') {
        await outbox.send(
          noShowFollowUpEmail({
            orderId: parsed.data.orderId,
            appointmentId: result.appointmentId,
            publicCode: result.publicCode,
            to: result.recipient,
            origin: publicAppOrigin(process.env),
            scheduledFor: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString(),
          }),
        );
      }
      emailQueued = true;
    } catch (error) {
      console.error('admin_action_email_queue_failed', {
        orderId: parsed.data.orderId,
        action: parsed.data.intent,
        error: error instanceof Error ? error.message : 'unknown',
      });
    }
  }
  const requested = parsed.data.returnTo ?? '/sprava';
  const destination =
    requested === '/sprava' || (requested.startsWith('/sprava?') && !requested.includes('\\'))
      ? requested
      : '/sprava';
  const url = new URL(destination, request.url);
  url.searchParams.set(
    'actionResult',
    emailQueued
      ? parsed.data.intent === 'attend'
        ? 'attended'
        : parsed.data.intent === 'no_show'
          ? 'no_show'
          : 'cancelled'
      : 'email_failed',
  );
  const destinationPath = url.pathname + url.search;
  return request.headers.get('x-admin-async') === '1'
    ? Response.json({ redirectTo: destinationPath })
    : redirect(destinationPath, 303);
};
