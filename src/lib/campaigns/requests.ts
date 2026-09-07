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
  })
  .strict();

export type CampaignRequestInput = z.infer<typeof campaignRequestSchema>;

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
    const response = await fetch(`${this.restBase}campaign_requests`, {
      method: 'POST',
      headers: this.headers({ Prefer: 'return=representation' }),
      body: JSON.stringify({
        campaign_id: input.campaignId,
        status: 'received',
        contact: input.contact,
        selection: input.selection,
        payload: { ...input.payload, sourceUrl: meta.sourceUrl },
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
    return rows[0];
  }
}
