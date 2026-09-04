import { z } from 'zod';
import type { PublicOrderOverview } from '../../booking/repository';

const orderSchema = z.object({
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
});

const reportSchema = z.object({
  ordersTotal: z.number().int().nonnegative(),
  ordersValueCzk: z.number().int().nonnegative(),
  averageOrderValueCzk: z.number().nonnegative(),
  bookedAppointments: z.number().int().nonnegative(),
  withoutAppointment: z.number().int().nonnegative(),
  cancelledOrders: z.number().int().nonnegative(),
  byCourse: z.array(
    z.object({
      key: z.string(),
      count: z.number().int().nonnegative(),
      valueCzk: z.number().int().nonnegative(),
    }),
  ),
  byBranch: z.array(
    z.object({
      key: z.string(),
      count: z.number().int().nonnegative(),
      valueCzk: z.number().int().nonnegative(),
    }),
  ),
  byPackage: z.array(
    z.object({
      key: z.string(),
      count: z.number().int().nonnegative(),
      valueCzk: z.number().int().nonnegative(),
    }),
  ),
  dailyAverage: z.number().nonnegative().optional(),
  strongestDayByOrders: z
    .object({ date: z.string(), count: z.number().int().nonnegative() })
    .nullable()
    .optional(),
  strongestDayByValue: z
    .object({ date: z.string(), valueCzk: z.number().int().nonnegative() })
    .nullable()
    .optional(),
});

export type EmailReportSummary = z.infer<typeof reportSchema>;

export class SupabaseEmailRepository {
  private readonly rpcBase: string;
  private readonly key: string;

  constructor(env: Record<string, string | undefined>) {
    if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY)
      throw new Error('Supabase email repository configuration is missing');
    this.rpcBase = new URL('/rest/v1/rpc/', env.SUPABASE_URL).href;
    this.key = env.SUPABASE_SERVICE_ROLE_KEY;
  }

  private async rpc(name: string, body: unknown) {
    const response = await fetch(this.rpcBase + name, {
      method: 'POST',
      headers: {
        apikey: this.key,
        Authorization: `Bearer ${this.key}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(12000),
      redirect: 'error',
    });
    if (!response.ok) throw new Error(`Email repository RPC failed: ${name}`);
    return response.json() as Promise<unknown>;
  }

  async appointmentReminderCandidates(input: { localDate: string }) {
    return z
      .array(orderSchema)
      .parse(
        await this.rpc('bubu_email_appointment_reminders', { p_local_date: input.localDate }),
      ) as PublicOrderOverview[];
  }

  async unbookedOrderCandidates(input: { localDate: string }) {
    return z
      .array(orderSchema)
      .parse(
        await this.rpc('bubu_email_unbooked_orders', { p_local_date: input.localDate }),
      ) as PublicOrderOverview[];
  }

  async report(input: { from: string; to: string; days: number }) {
    return reportSchema.parse(
      await this.rpc('bubu_email_order_report', {
        p_from: input.from,
        p_to: input.to,
        p_days: input.days,
      }),
    );
  }
}
