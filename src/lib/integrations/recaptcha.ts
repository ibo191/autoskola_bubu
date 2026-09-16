import { z } from 'zod';
import type { CaptchaAction, CaptchaAdapter } from './contracts';

const responseSchema = z.object({
  success: z.boolean(),
  score: z.number().min(0).max(1).optional(),
  action: z.string().optional(),
  hostname: z.string().optional(),
});

/** Server-side verifier for reCAPTCHA v3. The secret key never reaches the browser. */
export class RecaptchaV3 implements CaptchaAdapter {
  private secret: string;
  private minimumScore: number;

  constructor(env: Record<string, string | undefined>) {
    if (!env.RECAPTCHA_SECRET_KEY) throw new Error('RECAPTCHA_SECRET_KEY is missing');
    this.secret = env.RECAPTCHA_SECRET_KEY;
    const configuredScore = Number(env.RECAPTCHA_MIN_SCORE ?? '0.5');
    this.minimumScore =
      Number.isFinite(configuredScore) && configuredScore >= 0 && configuredScore <= 1
        ? configuredScore
        : 0.5;
  }

  async verify(input: { token: string; action: CaptchaAction; hostname: string; now: Date }) {
    if (!input.token || input.token.length > 4096) return false;
    try {
      const body = new URLSearchParams({ secret: this.secret, response: input.token });
      const response = await fetch('https://www.google.com/recaptcha/api/siteverify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body,
        signal: AbortSignal.timeout(5000),
      });
      if (!response.ok) return false;
      const result = responseSchema.parse(await response.json());
      return (
        result.success &&
        result.action === input.action &&
        result.hostname === input.hostname &&
        (result.score ?? 0) >= this.minimumScore
      );
    } catch {
      return false;
    }
  }
}
