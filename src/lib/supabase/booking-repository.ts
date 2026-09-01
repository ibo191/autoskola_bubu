import { z } from 'zod';
import { readConfig } from '../config';
import type {
  AdminSummary,
  AvailableSlot,
  BookingRepository,
  ProvisionalInput,
} from '../booking/repository';
import type { RateLimiter } from '../security/rate-limit';
const createdSchema = z.object({
  orderId: z.uuid(),
  appointmentId: z.uuid(),
  expiresAt: z.iso.datetime({ offset: true }),
});
const slotSchema = z.object({
  id: z.uuid(),
  branch: z.string(),
  starts_at: z.iso.datetime({ offset: true }),
  ends_at: z.iso.datetime({ offset: true }),
  remaining: z.number().int().positive(),
});
const adminSummarySchema = z.object({
  ordersTotal: z.number().int().nonnegative(),
  ordersConfirmed: z.number().int().nonnegative(),
  appointmentsTotal: z.number().int().nonnegative(),
  byCourse: z.array(z.object({ course: z.string(), count: z.number().int().nonnegative() })),
  byDay: z.array(z.object({ date: z.string(), count: z.number().int().nonnegative() })),
});
/** Server-only REST adapter. Browser code must never import this module. */
export class SupabaseBookingRepository implements BookingRepository {
  private base: string;
  private key: string;
  constructor(env: Record<string, string | undefined>) {
    readConfig(env);
    if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY)
      throw new Error('Local Supabase configuration is missing');
    this.base = new URL('/rest/v1/rpc/', env.SUPABASE_URL).href;
    this.key = env.SUPABASE_SERVICE_ROLE_KEY;
  }
  private async rpc(
    name:
      | 'bubu_available_slots'
      | 'bubu_create_provisional'
      | 'bubu_verify_email'
      | 'bubu_admin_summary',
    body: unknown,
  ) {
    const response = await fetch(this.base + name, {
      method: 'POST',
      headers: {
        apikey: this.key,
        Authorization: `Bearer ${this.key}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(10000),
      redirect: 'error',
    });
    if (!response.ok) throw new Error('Booking database operation failed');
    return response.json() as Promise<unknown>;
  }
  async listAvailableSlots(input: { branch: string; from: string; to: string }) {
    const rows = z.array(slotSchema).parse(
      await this.rpc('bubu_available_slots', {
        p_branch: input.branch,
        p_from: input.from,
        p_to: input.to,
      }),
    );
    return rows.map((row): AvailableSlot => ({
      id: row.id,
      branch: row.branch,
      startsAt: row.starts_at,
      endsAt: row.ends_at,
      remaining: row.remaining,
    }));
  }
  async createProvisional(input: ProvisionalInput) {
    return createdSchema.parse(
      await this.rpc('bubu_create_provisional', {
        p_slot: input.slotId,
        p_contact: input.contact,
        p_selection: input.selection,
        p_price: input.price,
        p_terms: input.terms,
        p_marketing: input.marketing,
        p_token_hash: input.verificationHash,
      }),
    );
  }
  async verifyEmail(hash: string) {
    z.string()
      .regex(/^[a-f0-9]{64}$/)
      .parse(hash);
    return z
      .object({ ok: z.boolean(), orderId: z.uuid().optional() })
      .parse(await this.rpc('bubu_verify_email', { p_hash: hash }));
  }
  async adminSummary(input: { from: string; to: string; course?: string | null }) {
    return adminSummarySchema.parse(
      await this.rpc('bubu_admin_summary', {
        p_from: input.from,
        p_to: input.to,
        p_course: input.course || null,
      }),
    ) as AdminSummary;
  }
}

const rateSchema = z.object({
  allowed: z.boolean(),
  retryAfterSeconds: z.number().int().nonnegative(),
});

export class SupabaseRateLimiter implements RateLimiter {
  private base: string;
  private key: string;
  constructor(env: Record<string, string | undefined>) {
    readConfig(env);
    if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY)
      throw new Error('Supabase rate limit configuration is missing');
    this.base = new URL('/rest/v1/rpc/', env.SUPABASE_URL).href;
    this.key = env.SUPABASE_SERVICE_ROLE_KEY;
  }
  async consume(input: {
    scope: 'create_order';
    key: string;
    now: Date;
    limit: number;
    windowMs: number;
  }) {
    const response = await fetch(this.base + 'bubu_rate_limit_consume', {
      method: 'POST',
      headers: {
        apikey: this.key,
        Authorization: `Bearer ${this.key}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        p_scope: input.scope,
        p_key: input.key,
        p_limit: input.limit,
        p_window_seconds: Math.ceil(input.windowMs / 1000),
      }),
      signal: AbortSignal.timeout(10000),
      redirect: 'error',
    });
    if (!response.ok) throw new Error('Rate limit operation failed');
    return rateSchema.parse(await response.json());
  }
}
