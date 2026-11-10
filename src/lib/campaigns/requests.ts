import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { campaignId } from './config';

export const campaignRequestSchema = z
  .object({
    campaignId,
    contact: z.object({
      firstName: z.string().trim().min(1).max(80),
      lastName: z.string().trim().min(1).max(80).optional().default(''),
      email: z.email().max(254),
      phone: z.string().trim().min(7).max(40),
    }),
    selection: z
      .object({
        course: z.string().max(40).optional(),
        branch: z.string().max(40).optional(),
        bonusVariant: z.string().max(80).optional(),
        deliveryMethod: z.enum(['shipping', 'branch-pickup']).optional(),
      })
      .default({}),
    payload: z.record(z.string(), z.unknown()).default({}),
    termsAccepted: z.literal(true),
    marketingAccepted: z.boolean().default(false),
    recaptchaToken: z.string().max(4096).optional(),
  })
  .strict();

export type CampaignRequestInput = z.infer<typeof campaignRequestSchema>;

export const voucherDetailsSchema = z.object({
  recipientFirstName: z.string().trim().min(1).max(80),
  recipientLastName: z.string().trim().max(80).optional(),
  message: z.string().trim().max(300).optional(),
});

const voucherRowSchema = z.object({
  id: z.uuid(),
  created_at: z.iso.datetime({ offset: true }),
  contact: z.object({
    firstName: z.string().optional(),
    lastName: z.string().optional(),
    email: z.string().optional(),
    phone: z.string().optional(),
  }),
  selection: z.object({
    branch: z.string().optional(),
    course: z.string().optional(),
    deliveryMethod: z.string().optional(),
  }),
  payload: z.object({
    recipientFirstName: z.string().optional(),
    recipientLastName: z.string().optional(),
    message: z.string().optional(),
    voucherNumber: z.string().optional(),
  }),
  amount_due_czk: z.number().int().nullable(),
  payment_status: z.string(),
});

const formatVoucherNumber = (id: string) => `BUBU-${id.toUpperCase()}`;

export const campaignConsent = {
  terms: {
    version: 'VOP-2026-09-01',
    wording: 'Seznámil/a jsem se s Všeobecnými obchodními podmínkami a souhlasím s nimi.',
  },
  privacy: {
    version: 'GDPR-2026-09-01',
    wording:
      'Odesláním formuláře potvrzujete, že jste se seznámil/a s Informacemi o zpracování osobních údajů. Vaše údaje zpracováváme za účelem vyřízení poptávky, rezervace kampaně a navazující komunikace.',
  },
  marketing: {
    version: 'MARKETING-2026-09-01',
    wording:
      'Chci dostávat novinky, nabídky a informace o akcích Autoškoly BuBu. Souhlas mohu kdykoliv odvolat.',
  },
} as const;

export class CampaignRequestRepository {
  private readonly restBase: string;
  private readonly key: string;

  constructor(env: Record<string, string | undefined>) {
    if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY)
      throw new Error('Supabase campaign repository configuration is missing');
    this.restBase = new URL('/rest/v1/', env.SUPABASE_URL).href;
    this.key = env.SUPABASE_SERVICE_ROLE_KEY;
  }

  private headers(extra?: HeadersInit) {
    return {
      apikey: this.key,
      Authorization: `Bearer ${this.key}`,
      'Content-Type': 'application/json',
      ...extra,
    };
  }

  async create(
    input: CampaignRequestInput,
    meta: { amountDueCzk?: number | null; sourceUrl: string },
  ) {
    const id = input.campaignId === 'vanoce' ? randomUUID() : undefined;
    const voucherNumber = id ? formatVoucherNumber(id) : undefined;
    const response = await fetch(`${this.restBase}campaign_requests`, {
      method: 'POST',
      headers: this.headers({ Prefer: 'return=representation' }),
      body: JSON.stringify({
        id,
        campaign_id: input.campaignId,
        status: 'received',
        contact: input.contact,
        selection: input.selection,
        payload: {
          ...input.payload,
          sourceUrl: meta.sourceUrl,
          ...(voucherNumber ? { voucherNumber } : {}),
        },
        amount_due_czk: meta.amountDueCzk ?? null,
        payment_status: meta.amountDueCzk ? 'pending_offline_payment' : 'not_required',
        consent_terms: { ...campaignConsent.terms, accepted: true },
        consent_privacy: { ...campaignConsent.privacy, accepted: true },
        consent_marketing: { ...campaignConsent.marketing, accepted: input.marketingAccepted },
      }),
      signal: AbortSignal.timeout(10000),
      redirect: 'error',
    });
    if (!response.ok) throw new Error(`Campaign request insert failed: ${response.status}`);
    const rows = (await response.json()) as Array<{ id: string; created_at: string }>;
    const stored = rows[0];
    if (!stored?.id) throw new Error('Campaign request insert did not return an ID');
    return { ...stored, voucherNumber };
  }

  async listChristmasVouchers() {
    const url = new URL('campaign_requests', this.restBase);
    url.search = new URLSearchParams({
      campaign_id: 'eq.vanoce',
      select: 'id,created_at,contact,selection,payload,amount_due_czk,payment_status',
      order: 'created_at.desc',
      limit: '100',
    }).toString();
    const response = await fetch(url, {
      headers: this.headers(),
      cache: 'no-store',
      signal: AbortSignal.timeout(10000),
      redirect: 'error',
    });
    if (!response.ok) throw new Error(`Christmas voucher list failed: ${response.status}`);
    const rows = z.array(voucherRowSchema).parse(await response.json());
    return rows.map(({ payload, ...row }) => ({
      ...row,
      recipient: [payload.recipientFirstName, payload.recipientLastName].filter(Boolean).join(' '),
      dedication: payload.message,
      voucherNumber:
        payload.voucherNumber === formatVoucherNumber(row.id) ? payload.voucherNumber : null,
    }));
  }
}
