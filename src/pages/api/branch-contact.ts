import type { APIRoute } from 'astro';
import { z } from 'zod';
import { branches, branchId } from '../../lib/catalog';
import { assertSameOrigin } from '../../lib/server/live-order';

export const prerender = false;

const bodySchema = z
  .object({
    branch: branchId,
    name: z.string().trim().min(2).max(120),
    email: z
      .email()
      .max(254)
      .transform((value) => value.trim().toLowerCase()),
    phone: z.string().trim().max(30).optional().default(''),
    message: z.string().trim().min(5).max(2000),
    website: z.literal('').default(''),
  })
  .strict();

async function readJson(request: Request) {
  if (!request.headers.get('content-type')?.startsWith('application/json'))
    throw new Response(null, { status: 415 });
  const text = await request.text();
  if (text.length > 6000) throw new Response(null, { status: 413 });
  return JSON.parse(text);
}

export const POST: APIRoute = async ({ request }) => {
  try {
    assertSameOrigin(request);
    const parsed = bodySchema.safeParse(await readJson(request));
    if (!parsed.success)
      return Response.json({ ok: false, code: 'INVALID_REQUEST' }, { status: 422 });
    const branch = branches.find((item) => item.id === parsed.data.branch)!;
    const webhook = process.env.CONTACT_WEBHOOK_URL;
    if (!webhook) {
      return Response.json(
        { ok: false, code: 'CONTACT_NOT_CONFIGURED' },
        { status: 503, headers: { 'Cache-Control': 'no-store' } },
      );
    }
    const response = await fetch(webhook, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        to: branch.email,
        subject: `Dotaz z webu – ${branch.name}`,
        name: parsed.data.name,
        email: parsed.data.email,
        phone: parsed.data.phone,
        message: parsed.data.message,
        branch: branch.id,
      }),
      signal: AbortSignal.timeout(10000),
      redirect: 'error',
    });
    if (!response.ok) throw new Error('Contact webhook failed');
    return Response.json({ ok: true }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    if (error instanceof Response) return error;
    return Response.json(
      { ok: false, code: 'CONTACT_FAILED' },
      { status: 503, headers: { 'Cache-Control': 'no-store' } },
    );
  }
};
