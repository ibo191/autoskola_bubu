import { createHmac } from 'node:crypto';

export interface RateLimiter {
  consume(input: {
    scope: 'create_order';
    key: string;
    now: Date;
    limit: number;
    windowMs: number;
  }): Promise<{ allowed: boolean; retryAfterSeconds: number }>;
}

/** Hash network identifiers before they are used as limiter keys. */
export function requestFingerprint(identifier: string, secret: string) {
  if (secret.length < 32) throw new Error('Rate-limit secret must contain at least 32 characters');
  return createHmac('sha256', secret).update(identifier).digest('hex');
}

/** Single-process limiter for local development and unit tests only. */
export class LocalRateLimiter implements RateLimiter {
  private readonly windows = new Map<string, { startsAt: number; count: number }>();

  async consume(input: {
    scope: 'create_order';
    key: string;
    now: Date;
    limit: number;
    windowMs: number;
  }) {
    const id = `${input.scope}:${input.key}`;
    const timestamp = input.now.getTime();
    const existing = this.windows.get(id);
    const window =
      !existing || timestamp >= existing.startsAt + input.windowMs
        ? { startsAt: timestamp, count: 0 }
        : existing;
    window.count += 1;
    this.windows.set(id, window);
    const allowed = window.count <= input.limit;
    return {
      allowed,
      retryAfterSeconds: allowed
        ? 0
        : Math.max(1, Math.ceil((window.startsAt + input.windowMs - timestamp) / 1000)),
    };
  }
}
