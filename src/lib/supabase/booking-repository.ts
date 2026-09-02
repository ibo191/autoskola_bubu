import { z } from 'zod';
import { readConfig } from '../config';
import type {
  AdminSummary,
  AvailableSlot,
  BookingRepository,
  ProvisionalInput,
  PublicOrderOverview,
} from '../booking/repository';
import type { RateLimiter } from '../security/rate-limit';

const createdSchema = z.object({
  orderId: z.uuid(),
  publicCode: z.string().min(6),
  appointmentId: z.uuid(),
  expiresAt: z.iso.datetime({ offset: true }),
  startsAt: z.iso.datetime({ offset: true }),
  endsAt: z.iso.datetime({ offset: true }),
});
const slotSchema = z.object({
  id: z.uuid(),
  branch: z.string(),
  starts_at: z.iso.datetime({ offset: true }),
  ends_at: z.iso.datetime({ offset: true }),
  remaining: z.number().int().positive(),
});
const publicOrderSchema = z
  .object({
    orderId: z.uuid(),
    publicCode: z.string(),
    status: z.string(),
    contact: z.object({
      firstName: z.string(),
      lastName: z.string(),
      email: z.string(),
      phone: z.string(),
    }),
    selection: z.unknown(),
    price: z.unknown(),
    addons: z.array(
      z.object({
        id: z.string(),
        title: z.string(),
        quantity: z.number().int(),
        unitPrice: z.number().int(),
        total: z.number().int(),
      }),
    ),
    appointment: z
      .object({
        id: z.uuid(),
        branch: z.string(),
        status: z.string(),
        startsAt: z.iso.datetime({ offset: true }),
        endsAt: z.iso.datetime({ offset: true }),
      })
      .nullable(),
    createdAt: z.iso.datetime({ offset: true }),
  })
  .nullable();
const adminSummarySchema = z.object({
  ordersTotal: z.number().int().nonnegative(),
  ordersConfirmed: z.number().int().nonnegative(),
  appointmentsTotal: z.number().int().nonnegative(),
  byCourse: z.array(z.object({ course: z.string(), count: z.number().int().nonnegative() })),
  byDay: z.array(z.object({ date: z.string(), count: z.number().int().nonnegative() })),
});
const adminUserSchema = z.object({ email: z.string(), name: z.string() });
const adminLoginSchema = z.union([
  z.object({
    ok: z.literal(true),
    token: z.string().min(32),
    expiresAt: z.iso.datetime({ offset: true }),
    user: adminUserSchema,
  }),
  z.object({ ok: z.literal(false) }),
]);
const adminSessionSchema = z.union([
  z.object({ ok: z.literal(true), user: adminUserSchema }),
  z.object({ ok: z.literal(false) }),
]);
const adminOrderSchema = z.object({
  orderId: z.uuid(),
  publicCode: z.string(),
  createdAt: z.iso.datetime({ offset: true }),
  status: z.string(),
  branch: z.string(),
  course: z.string(),
  package: z.string(),
  totalCzk: z.number().int(),
  contact: z.object({
    firstName: z.string(),
    lastName: z.string(),
    email: z.string(),
    phone: z.string(),
  }),
  selection: z.unknown(),
  price: z.unknown(),
  addons: z.array(
    z.object({
      id: z.string(),
      title: z.string(),
      quantity: z.number().int(),
      unitPrice: z.number().int(),
      total: z.number().int(),
    }),
  ),
  appointment: z
    .object({
      id: z.uuid(),
      branch: z.string(),
      status: z.string(),
      startsAt: z.iso.datetime({ offset: true }),
      endsAt: z.iso.datetime({ offset: true }),
    })
    .nullable(),
});
const adminAppointmentSchema = z.object({
  appointmentId: z.uuid(),
  status: z.string(),
  branch: z.string(),
  startsAt: z.iso.datetime({ offset: true }),
  endsAt: z.iso.datetime({ offset: true }),
  publicCode: z.string(),
  course: z.string(),
  package: z.string(),
  totalCzk: z.number().int(),
  contact: z.object({
    firstName: z.string(),
    lastName: z.string(),
    email: z.string(),
    phone: z.string(),
  }),
});
const nextAppointmentDaySchema = z
  .object({ date: z.string(), count: z.number().int().nonnegative() })
  .nullable();
export type AdminUser = z.infer<typeof adminUserSchema>;
export type AdminOrder = z.infer<typeof adminOrderSchema>;
export type AdminAppointment = z.infer<typeof adminAppointmentSchema>;
export type NextAppointmentDay = z.infer<typeof nextAppointmentDaySchema>;

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
      | 'bubu_admin_summary'
      | 'bubu_public_order'
      | 'bubu_reschedule_appointment'
      | 'bubu_cancel_appointment'
      | 'bubu_admin_login'
      | 'bubu_admin_session'
      | 'bubu_admin_logout'
      | 'bubu_admin_orders'
      | 'bubu_admin_appointments'
      | 'bubu_admin_next_appointment_day',
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
        p_privacy: input.privacy,
        p_marketing: input.marketing,
        p_items: input.addons.map((item) => ({
          product_id: item.id,
          variant_id: item.id,
          title: item.title,
          quantity: item.quantity,
          unit_price_czk: item.unitPrice,
        })),
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
  async getPublicOrder(publicCode: string) {
    const parsed = publicOrderSchema.parse(
      await this.rpc('bubu_public_order', { p_public_code: publicCode }),
    );
    return parsed as PublicOrderOverview | null;
  }
  async rescheduleAppointment(input: { publicCode: string; slotId: string }) {
    return z
      .union([
        z.object({
          ok: z.literal(true),
          appointmentId: z.uuid(),
          startsAt: z.iso.datetime({ offset: true }),
          endsAt: z.iso.datetime({ offset: true }),
        }),
        z.object({ ok: z.literal(false) }),
      ])
      .parse(
        await this.rpc('bubu_reschedule_appointment', {
          p_public_code: input.publicCode,
          p_slot: input.slotId,
        }),
      );
  }
  async cancelAppointment(publicCode: string) {
    return z
      .object({ ok: z.boolean() })
      .parse(await this.rpc('bubu_cancel_appointment', { p_public_code: publicCode }));
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
  async adminLogin(input: { email: string; password: string }) {
    return adminLoginSchema.parse(
      await this.rpc('bubu_admin_login', { p_email: input.email, p_password: input.password }),
    );
  }
  async adminSession(token: string) {
    return adminSessionSchema.parse(await this.rpc('bubu_admin_session', { p_token: token }));
  }
  async adminLogout(token: string) {
    return z
      .object({ ok: z.boolean() })
      .parse(await this.rpc('bubu_admin_logout', { p_token: token }));
  }
  async adminOrders(input: {
    from: string;
    to: string;
    course?: string | null;
    branch?: string | null;
    status?: string | null;
    query?: string | null;
    limit?: number;
  }) {
    return z.array(adminOrderSchema).parse(
      await this.rpc('bubu_admin_orders', {
        p_from: input.from,
        p_to: input.to,
        p_course: input.course || null,
        p_branch: input.branch || null,
        p_status: input.status || null,
        p_query: input.query || null,
        p_limit: input.limit ?? 200,
      }),
    );
  }
  async adminAppointments(input: { date: string; branch?: string | null }) {
    return z.array(adminAppointmentSchema).parse(
      await this.rpc('bubu_admin_appointments', {
        p_local_date: input.date,
        p_branch: input.branch || null,
      }),
    );
  }
  async adminNextAppointmentDay(input: { from: string; branch?: string | null }) {
    return nextAppointmentDaySchema.parse(
      await this.rpc('bubu_admin_next_appointment_day', {
        p_from: input.from,
        p_branch: input.branch || null,
      }),
    );
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
