import type { APIRoute } from 'astro';
import { z } from 'zod';
import { assertSameOrigin } from '../../lib/server/live-order';
import {
  createTransactionalEmailAdapter,
  isTransactionalEmailConfigured,
} from '../../lib/server/email';
import { contactFormEmail } from '../../lib/server/email/templates';

export const prerender = false;

const bodySchema = z
  .object({
    name: z.string().trim().min(2).max(120),
    email: z
      .email()
      .max(254)
      .transform((value) => value.trim().toLowerCase()),
    phone: z.string().trim().max(30).optional().default(''),
    subject: z.string().trim().max(160).optional().default('Dotaz z webu'),
    message: z.string().trim().min(5).max(2500),
    website: z.literal('').default(''),
  })
  .strict();

async function readJson(request: Request) {
  if (!request.headers.get('content-type')?.startsWith('application/json')) {
    throw new Response(null, { status: 415 });
  }
  const text = await request.text();
  if (text.length > 7000) throw new Response(null, { status: 413 });
  return JSON.parse(text);
}

export const POST: APIRoute = async ({ request }) => {
  try {
    assertSameOrigin(request);
    const parsed = bodySchema.safeParse(await readJson(request));
    if (!parsed.success) {
      return Response.json({ ok: false, code: 'INVALID_REQUEST' }, { status: 422 });
    }
    if (!isTransactionalEmailConfigured(process.env)) {
      return Response.json(
        { ok: false, code: 'CONTACT_NOT_CONFIGURED' },
        { status: 503, headers: { 'Cache-Control': 'no-store' } },
      );
    }

    await createTransactionalEmailAdapter(process.env).send(
      contactFormEmail({
        to:
          process.env.GENERAL_CONTACT_EMAIL ??
          process.env.CONTACT_TO_EMAIL ??
          'info@autoskolabubu.cz',
        source: 'contact-page',
        name: parsed.data.name,
        email: parsed.data.email,
        phone: parsed.data.phone,
        subject: parsed.data.subject,
        message: parsed.data.message,
      }),
    );
    return Response.json({ ok: true }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    if (error instanceof Response) return error;
    console.warn('contact_email_failed', {
      error: error instanceof Error ? error.message : 'unknown',
    });
    return Response.json(
      { ok: false, code: 'CONTACT_FAILED' },
      { status: 503, headers: { 'Cache-Control': 'no-store' } },
    );
  }
};
