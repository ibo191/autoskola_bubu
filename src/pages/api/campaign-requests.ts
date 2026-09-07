import type { APIRoute } from 'astro';
import { christmasCampaign } from '../../lib/campaigns/config';
import { CampaignRequestRepository, campaignRequestSchema } from '../../lib/campaigns/requests';
import { assertSameOrigin } from '../../lib/server/live-order';
import { createTransactionalEmailAdapter, orderNotificationEmail } from '../../lib/server/email';
import { contactFormEmail } from '../../lib/server/email/templates';

export const prerender = false;

async function readJson(request: Request) {
  if (!request.headers.get('content-type')?.startsWith('application/json'))
    throw new Response(null, { status: 415 });
  const reader = request.body?.getReader();
  if (!reader) throw new Response(null, { status: 400 });
  let size = 0;
  const chunks: Uint8Array[] = [];
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > 16384) {
      await reader.cancel();
      throw new Response(null, { status: 413 });
    }
    chunks.push(value);
  }
  return JSON.parse(new TextDecoder().decode(Buffer.concat(chunks)));
}

export const POST: APIRoute = async ({ request }) => {
  try {
    assertSameOrigin(request);
    if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
      return Response.json(
        { ok: false, code: 'CAMPAIGN_NOT_CONFIGURED', message: 'Databáze kampaní není nastavená.' },
        { status: 503, headers: { 'Cache-Control': 'no-store' } },
      );
    }
    const parsed = campaignRequestSchema.safeParse(await readJson(request));
    if (!parsed.success) {
      return Response.json(
        { ok: false, code: 'INVALID_REQUEST', issues: parsed.error.issues },
        { status: 422, headers: { 'Cache-Control': 'no-store' } },
      );
    }

    const amountDueCzk =
      parsed.data.campaignId === 'vanoce' ? christmasCampaign.onlineTotalCzk : null;
    const stored = await new CampaignRequestRepository(process.env).create(parsed.data, {
      amountDueCzk,
      sourceUrl: request.headers.get('referer') ?? new URL(request.url).origin,
    });

    const message = contactFormEmail({
      to: orderNotificationEmail(process.env),
      source: `campaign:${parsed.data.campaignId}`,
      name: `${parsed.data.contact.firstName} ${parsed.data.contact.lastName}`.trim(),
      email: parsed.data.contact.email,
      phone: parsed.data.contact.phone,
      subject: parsed.data.campaignId === 'vanoce' ? 'Vánoční poukaz' : 'Black Friday bonus',
      message: [
        `Nová campaign žádost: ${parsed.data.campaignId}`,
        `ID: ${stored?.id ?? 'bez ID'}`,
        `Kurz: ${parsed.data.selection.course ?? 'neuvedeno'}`,
        `Pobočka: ${parsed.data.selection.branch ?? 'neuvedeno'}`,
        `Bonus: ${parsed.data.selection.bonusVariant ?? 'neuvedeno'}`,
        amountDueCzk ? `Budoucí online částka: ${amountDueCzk} Kč` : null,
        '',
        JSON.stringify(parsed.data.payload, null, 2),
      ]
        .filter(Boolean)
        .join('\n'),
      branch: parsed.data.selection.branch,
    });
    await createTransactionalEmailAdapter(process.env).send({
      ...message,
      idempotencyKey: `campaign-${parsed.data.campaignId}-${stored?.id ?? crypto.randomUUID()}`,
      metadata: { campaignId: parsed.data.campaignId, requestId: stored?.id ?? null },
    });

    return Response.json(
      { ok: true, requestId: stored?.id, createdAt: stored?.created_at },
      { headers: { 'Cache-Control': 'no-store' } },
    );
  } catch (error) {
    if (error instanceof Response) return error;
    return Response.json(
      { ok: false, code: 'CAMPAIGN_FAILED', message: 'Formulář se nepodařilo odeslat.' },
      { status: 503, headers: { 'Cache-Control': 'no-store' } },
    );
  }
};
