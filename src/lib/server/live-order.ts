import { readConfig } from '../config';
import { CreateOrderService, type OrderLegalSettings } from '../booking/create-order';
import { SupabaseBookingRepository, SupabaseRateLimiter } from '../supabase/booking-repository';
import { requestFingerprint } from '../security/rate-limit';
import type { CaptchaAdapter, EmailAdapter } from '../integrations/contracts';

const termsWording =
  'Souhlasím se všeobecnými obchodními podmínkami Autoškoly BuBu s.r.o. zveřejněnými na webu.';
const marketingWording =
  'Souhlasím se zasíláním dobrovolných novinek a informací o službách Autoškoly BuBu s.r.o.';

class PreviewCaptcha implements CaptchaAdapter {
  async verify(input: { token: string; action: string }) {
    return input.token === 'preview-order-submission';
  }
}

class PreviewEmail implements EmailAdapter {
  async send() {
    /* E-mail provider is intentionally not enabled for the live preview. */
  }
}

export const legalSettings: OrderLegalSettings = {
  approved: true,
  terms: { version: 'VOP-2026-09-01', wording: termsWording },
  marketing: { version: 'MARKETING-2026-09-01', wording: marketingWording },
};

export function requireLiveRepository(env: Record<string, string | undefined>) {
  readConfig(env);
  return new SupabaseBookingRepository(env);
}

export function createLiveOrderService(env: Record<string, string | undefined>) {
  const config = readConfig(env);
  return new CreateOrderService({
    repository: new SupabaseBookingRepository(env),
    captcha: new PreviewCaptcha(),
    email: new PreviewEmail(),
    rateLimiter: new SupabaseRateLimiter(env),
    legal: legalSettings,
    origin: config.APP_ORIGIN,
  });
}

export function fingerprintRequest(request: Request, env: Record<string, string | undefined>) {
  const secret = env.RATE_LIMIT_SECRET ?? env.SUPABASE_SERVICE_ROLE_KEY ?? '';
  const forwarded = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim();
  const identifier =
    forwarded ||
    request.headers.get('x-real-ip') ||
    request.headers.get('cf-connecting-ip') ||
    'unknown-client';
  return requestFingerprint(identifier, secret);
}

export function assertSameOrigin(request: Request) {
  const requestOrigin = new URL(request.url).origin;
  const origin = request.headers.get('origin');
  if (origin && origin !== requestOrigin) throw new Error('INVALID_ORIGIN');
}
