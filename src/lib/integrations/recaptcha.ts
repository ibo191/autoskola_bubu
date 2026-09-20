import type { CaptchaAction, CaptchaAdapter } from './contracts';
import { verifyRecaptcha } from '../server/recaptcha';

/** Server-side verifier for reCAPTCHA v3. The secret key never reaches the browser. */
export class RecaptchaV3 implements CaptchaAdapter {
  constructor(private readonly env: Record<string, string | undefined>) {}

  async verify(input: { token: string; action: CaptchaAction; hostname: string; now: Date }) {
    return verifyRecaptcha(input.token, input.action, { env: this.env, hostname: input.hostname });
  }
}
