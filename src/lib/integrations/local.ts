import { randomBytes } from 'node:crypto';
import { readConfig } from '../config';
import type {
  CaptchaAction,
  CaptchaAdapter,
  EmailAdapter,
  EmailMessage,
  AnalyticsAdapter,
} from './contracts';
/** Test-only adapters. Not wired into any public endpoint. Every constructor checks mode. */
export class LocalCaptcha implements CaptchaAdapter {
  private tokens = new Map<string, { action: CaptchaAction; hostname: string; expires: number }>();
  constructor(env: Record<string, string | undefined>) {
    readConfig(env);
  }
  issue(action: CaptchaAction, now: Date, hostname = '127.0.0.1') {
    const token = randomBytes(24).toString('base64url');
    this.tokens.set(token, { action, hostname, expires: now.getTime() + 120000 });
    return token;
  }
  async verify(input: { token: string; action: CaptchaAction; hostname: string; now: Date }) {
    const value = this.tokens.get(input.token);
    this.tokens.delete(input.token);
    return (
      !!value &&
      value.action === input.action &&
      value.hostname === input.hostname &&
      value.expires > input.now.getTime()
    );
  }
}
export class LocalEmail implements EmailAdapter {
  readonly messages = new Map<string, EmailMessage>();
  constructor(env: Record<string, string | undefined>) {
    readConfig(env);
  }
  async send(message: EmailMessage) {
    if (!this.messages.has(message.idempotencyKey))
      this.messages.set(message.idempotencyKey, { ...message });
    return { status: 'local' };
  }
}
export class NoopAnalytics implements AnalyticsAdapter {
  constructor(env: Record<string, string | undefined>) {
    readConfig(env);
  }
  track() {
    /* No network and no PII. */
  }
}
