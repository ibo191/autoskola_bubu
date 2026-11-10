import type { APIRoute } from 'astro';
import { christmasCampaign } from '../../lib/campaigns/config';
import {
  CampaignRequestRepository,
  campaignRequestSchema,
  voucherDetailsSchema,
} from '../../lib/campaigns/requests';
import { assertSameOrigin } from '../../lib/server/live-order';
import { createTransactionalEmailAdapter, orderNotificationEmail } from '../../lib/server/email';
import { contactFormEmail } from '../../lib/server/email/templates';
import { verifyRecaptcha } from '../../lib/server/recaptcha';

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
    const input = parsed.data;
    const isVoucher = input.campaignId === 'vanoce';
    if (isVoucher) {
      const { branch, course, deliveryMethod } = input.selection;
      if (
        !christmasCampaign.pickupBranches.some((pickup) => pickup === branch) ||
        (deliveryMethod && deliveryMethod !== 'branch-pickup')
      ) {
        return Response.json(
          {
            ok: false,
            code: 'PICKUP_BRANCH_REQUIRED',
            message: 'Poukaz lze vyzvednout osobně na Střížkově nebo v Kladně. Vyberte pobočku.',
          },
          { status: 422, headers: { 'Cache-Control': 'no-store' } },
        );
      }
      const details = voucherDetailsSchema.safeParse(input.payload);
      if (
        !details.success ||
        (course && !christmasCampaign.eligibleCourses.some((id) => id === course))
      ) {
        return Response.json(
          {
            ok: false,
            code: 'INVALID_VOUCHER_DETAILS',
            message: 'Zkontrolujte údaje obdarovaného a vybraný kurz.',
          },
          { status: 422, headers: { 'Cache-Control': 'no-store' } },
        );
      }
      input.selection = {
        branch,
        course,
        deliveryMethod: 'branch-pickup',
        bonusVariant: christmasCampaign.bonus.id,
      };
      input.payload = {
        ...details.data,
        bonus: christmasCampaign.bonus,
        paymentMethod: 'at-pickup',
      };
    }

    const captchaValid = await verifyRecaptcha(input.recaptchaToken, 'campaign_request', {
      env: process.env,
      hostname: new URL(request.url).hostname,
    });
    if (!captchaValid) {
      return Response.json(
        {
          ok: false,
          code: 'CAPTCHA_FAILED',
          message: 'Odeslání se nepodařilo. Zkuste to prosím znovu.',
        },
        { status: 403, headers: { 'Cache-Control': 'no-store' } },
      );
    }
    const amountDueCzk = isVoucher ? christmasCampaign.depositCzk : null;
    const stored = await new CampaignRequestRepository(process.env).create(input, {
      amountDueCzk,
      sourceUrl: request.headers.get('referer') ?? new URL(request.url).origin,
    });

    const { voucherNumber } = stored;
    const message = contactFormEmail({
      to: orderNotificationEmail(process.env),
      source: `campaign:${input.campaignId}`,
      name: `${input.contact.firstName} ${input.contact.lastName}`.trim(),
      email: input.contact.email,
      phone: input.contact.phone,
      subject: isVoucher ? 'Vánoční poukaz' : 'Black Friday bonus',
      message: [
        `Nová campaign žádost: ${input.campaignId}`,
        `ID: ${stored.id}`,
        voucherNumber ? `Číslo poukazu: ${voucherNumber}` : null,
        `Kurz: ${input.selection.course ?? 'neuvedeno'}`,
        `Pobočka: ${input.selection.branch ?? 'neuvedeno'}`,
        `Bonus: ${isVoucher ? christmasCampaign.bonus.title : (input.selection.bonusVariant ?? 'neuvedeno')}`,
        amountDueCzk ? `Částka k úhradě: ${amountDueCzk} Kč` : null,
        isVoucher ? 'Platba: nevratná záloha při osobním převzetí na vybrané pobočce.' : null,
        '',
        JSON.stringify(input.payload, null, 2),
      ]
        .filter(Boolean)
        .join('\n'),
      branch: input.selection.branch,
    });
    try {
      await createTransactionalEmailAdapter(process.env).send({
        ...message,
        idempotencyKey: `campaign-${input.campaignId}-${stored.id}`,
        metadata: { campaignId: input.campaignId, requestId: stored.id },
      });
    } catch (error) {
      if (!isVoucher) throw error;
      // The reservation already exists. Avoid asking the customer to submit it again.
      console.error('voucher_notification_failed', { requestId: stored.id });
    }

    return Response.json(
      { ok: true, requestId: stored.id, createdAt: stored.created_at, voucherNumber },
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
