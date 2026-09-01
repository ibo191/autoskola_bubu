import { z } from 'zod';
import type { BookingRepository, ConsentSnapshot } from './repository';
import type { CaptchaAdapter, EmailAdapter } from '../integrations/contracts';
import { contactSchema } from '../validation/contact';
import { quote, selectionSchema } from '../pricing/quote';
import { createToken } from '../security/tokens';
import type { RateLimiter } from '../security/rate-limit';

const requestSchema = z
  .object({
    slotId: z.uuid(),
    contact: contactSchema,
    selection: selectionSchema,
    captchaToken: z.string().min(16).max(512),
    priceVersion: z.string().min(1).max(80),
    termsAccepted: z.literal(true),
    privacyAccepted: z.literal(true),
    marketingAccepted: z.boolean().default(false),
  })
  .strict();

export type OrderLegalSettings = {
  approved: boolean;
  terms: Omit<ConsentSnapshot, 'accepted'>;
  marketing: Omit<ConsentSnapshot, 'accepted'>;
};

export type CreateOrderResult =
  | {
      ok: true;
      orderId: string;
      appointmentId: string;
      expiresAt: string;
    }
  | {
      ok: false;
      code:
        | 'ORDERS_DISABLED'
        | 'RATE_LIMITED'
        | 'INVALID_REQUEST'
        | 'CAPTCHA_FAILED'
        | 'QUOTE_CHANGED'
        | 'SELECTION_UNAVAILABLE'
        | 'STORAGE_FAILED';
      retryAfterSeconds?: number;
    };

type Dependencies = {
  repository: BookingRepository;
  captcha: CaptchaAdapter;
  email: EmailAdapter;
  rateLimiter: RateLimiter;
  legal: OrderLegalSettings;
  origin: string;
};

export class CreateOrderService {
  constructor(private readonly dependencies: Dependencies) {}

  async execute(context: {
    body: unknown;
    hostname: string;
    clientFingerprint: string;
    now: Date;
  }): Promise<CreateOrderResult> {
    if (!this.dependencies.legal.approved) return { ok: false, code: 'ORDERS_DISABLED' };

    const rate = await this.dependencies.rateLimiter.consume({
      scope: 'create_order',
      key: context.clientFingerprint,
      now: context.now,
      limit: 5,
      windowMs: 10 * 60 * 1000,
    });
    if (!rate.allowed)
      return { ok: false, code: 'RATE_LIMITED', retryAfterSeconds: rate.retryAfterSeconds };

    const parsed = requestSchema.safeParse(context.body);
    if (!parsed.success) return { ok: false, code: 'INVALID_REQUEST' };

    const captchaValid = await this.dependencies.captcha.verify({
      token: parsed.data.captchaToken,
      action: 'create_order',
      hostname: context.hostname,
      now: context.now,
    });
    if (!captchaValid) return { ok: false, code: 'CAPTCHA_FAILED' };

    const serverQuote = quote(parsed.data.selection);
    if (!serverQuote.ok) return { ok: false, code: 'SELECTION_UNAVAILABLE' };
    if (parsed.data.priceVersion !== serverQuote.priceVersion)
      return { ok: false, code: 'QUOTE_CHANGED' };

    const verification = createToken();
    let saved: Awaited<ReturnType<BookingRepository['createProvisional']>>;
    try {
      saved = await this.dependencies.repository.createProvisional({
        slotId: parsed.data.slotId,
        contact: parsed.data.contact,
        selection: parsed.data.selection,
        price: serverQuote,
        terms: { ...this.dependencies.legal.terms, accepted: true },
        marketing: {
          ...this.dependencies.legal.marketing,
          accepted: parsed.data.marketingAccepted,
        },
        verificationHash: verification.hash,
      });
    } catch {
      return { ok: false, code: 'STORAGE_FAILED' };
    }

    const verificationUrl = new URL('/overit-email', this.dependencies.origin);
    verificationUrl.searchParams.set('token', verification.token);
    await this.dependencies.email.send({
      idempotencyKey: `${saved.orderId}:verify-email`,
      to: parsed.data.contact.email,
      subject: 'Ověřte svůj e-mail – Autoškola BUBU',
      text: `Pro dokončení rezervace otevřete tento odkaz: ${verificationUrl.href}`,
    });

    return { ok: true, ...saved };
  }
}
