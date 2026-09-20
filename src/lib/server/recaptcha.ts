import { z } from 'zod';
import type { CaptchaAction } from '../integrations/contracts';

const verificationResponseSchema = z.object({
  success: z.boolean(),
  action: z.string().optional(),
  score: z.number().min(0).max(1).optional(),
  hostname: z.string().optional(),
});

type VerifyOptions = {
  env?: Record<string, string | undefined>;
  hostname?: string;
  fetcher?: typeof fetch;
};

/**
 * Verifies a short-lived reCAPTCHA v3 token on the server. The secret is read
 * only here (or supplied by a server-side caller for tests), never by client code.
 */
export async function verifyRecaptcha(
  token: string | undefined,
  expectedAction: CaptchaAction,
  options: VerifyOptions = {},
): Promise<boolean> {
  if (!token || token.length > 4096) return false;

  const runtimeEnv = import.meta.env as Record<string, string | undefined> | undefined;
  const secret = options.env?.RECAPTCHA_SECRET_KEY ?? runtimeEnv?.RECAPTCHA_SECRET_KEY;
  if (!secret) {
    console.warn('recaptcha_verification_unavailable', { reason: 'missing_secret' });
    return false;
  }

  try {
    const response = await (options.fetcher ?? fetch)(
      'https://www.google.com/recaptcha/api/siteverify',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ secret, response: token }),
        signal: AbortSignal.timeout(5000),
      },
    );
    if (!response.ok) return false;

    const parsed = verificationResponseSchema.safeParse(await response.json());
    if (!parsed.success) return false;
    const result = parsed.data;
    return (
      result.success === true &&
      result.action === expectedAction &&
      (result.score ?? 0) >= 0.5 &&
      (!options.hostname || result.hostname === options.hostname)
    );
  } catch {
    console.warn('recaptcha_verification_unavailable', { reason: 'verification_failed' });
    return false;
  }
}
