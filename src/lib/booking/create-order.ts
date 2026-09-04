import { z } from 'zod';
import type { BookingRepository, ConsentSnapshot } from './repository';
import type { CaptchaAdapter, EmailAdapter, EmailMessage } from '../integrations/contracts';
import { contactSchema } from '../validation/contact';
import { quote, selectionSchema } from '../pricing/quote';
import { createToken } from '../security/tokens';
import type { RateLimiter } from '../security/rate-limit';
import { internalNewOrderEmail, orderConfirmationEmail } from '../server/email/templates';

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
      publicCode: string;
      appointmentId: string;
      expiresAt: string;
      startsAt: string;
      endsAt: string;
      thankYouUrl: string;
      manageUrl: string;
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
  notificationEmail?: string;
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
        privacy: {
          version: 'GDPR-2026-09-01',
          wording:
            'Beru na vědomí zpracování osobních údajů potřebné pro objednávku a rezervaci zápisu.',
          accepted: true,
        },
        addons: serverQuote.addons,
        verificationHash: verification.hash,
      });
    } catch {
      return { ok: false, code: 'STORAGE_FAILED' };
    }

    const thankYouUrl = new URL('/dekujeme', this.dependencies.origin);
    thankYouUrl.searchParams.set('kod', saved.publicCode);
    const manageUrl = new URL('/spravovat-termin', this.dependencies.origin);
    manageUrl.searchParams.set('kod', saved.publicCode);
    const emailInput = {
      orderId: saved.orderId,
      publicCode: saved.publicCode,
      contact: parsed.data.contact,
      selection: parsed.data.selection,
      price: serverQuote,
      addons: serverQuote.addons,
      appointment: {
        id: saved.appointmentId,
        startsAt: saved.startsAt,
        endsAt: saved.endsAt,
      },
      createdAt: context.now,
      thankYouUrl: thankYouUrl.href,
      manageUrl: manageUrl.href,
      notificationEmail: this.dependencies.notificationEmail,
    };
    const messages = [orderConfirmationEmail(emailInput), internalNewOrderEmail(emailInput)].filter(
      (message): message is EmailMessage => Boolean(message),
    );
    const deliveries = await Promise.allSettled(
      messages.map((message) => this.dependencies.email.send(message)),
    );
    for (const delivery of deliveries) {
      if (delivery.status === 'rejected')
        console.warn('email_delivery_failed', {
          workflow: 'new_order',
          orderId: saved.orderId,
          error: delivery.reason instanceof Error ? delivery.reason.message : 'unknown',
        });
    }

    return { ok: true, ...saved, thankYouUrl: thankYouUrl.href, manageUrl: manageUrl.href };
  }
}
