import { z } from 'zod';
import { readConfig } from '../config';
import type { BookingRepository, ProvisionalInput } from '../booking/repository';
const createdSchema = z.object({
  orderId: z.uuid(),
  appointmentId: z.uuid(),
  expiresAt: z.iso.datetime({ offset: true }),
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
  private async rpc(name: 'bubu_create_provisional' | 'bubu_verify_email', body: unknown) {
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
}
