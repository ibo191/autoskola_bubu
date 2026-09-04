import type { EmailAdapter, EmailMessage, EmailSendResult } from '../../integrations/contracts';

export type EmailEventRow = {
  id: string;
  idempotency_key: string;
  status: 'pending' | 'sent' | 'failed' | 'skipped';
};

export class SupabaseEmailEventStore {
  private readonly restBase: string;
  private readonly key: string;

  constructor(env: Record<string, string | undefined>) {
    if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY)
      throw new Error('Supabase email event configuration is missing');
    this.restBase = new URL('/rest/v1/', env.SUPABASE_URL).href;
    this.key = env.SUPABASE_SERVICE_ROLE_KEY;
  }

  private headers(extra?: HeadersInit) {
    return {
      apikey: this.key,
      Authorization: `Bearer ${this.key}`,
      'Content-Type': 'application/json',
      ...extra,
    };
  }

  async createPending(message: EmailMessage) {
    const response = await fetch(`${this.restBase}email_events?on_conflict=idempotency_key`, {
      method: 'POST',
      headers: this.headers({ Prefer: 'resolution=ignore-duplicates,return=representation' }),
      body: JSON.stringify({
        idempotency_key: message.idempotencyKey,
        order_id: message.orderId ?? null,
        appointment_id: message.appointmentId ?? null,
        event_type: message.eventType ?? 'contact_form_notification',
        recipient: message.to,
        subject: message.subject,
        status: 'pending',
        scheduled_for: message.scheduledFor ?? new Date().toISOString(),
        report_date: message.reportDate ?? null,
        report_month: message.reportMonth ?? null,
        metadata: message.metadata ?? {},
      }),
      signal: AbortSignal.timeout(10000),
      redirect: 'error',
    });
    if (!response.ok) throw new Error(`Email event insert failed: ${response.status}`);
    const rows = (await response.json()) as EmailEventRow[];
    return rows[0] ?? null;
  }

  async markSent(id: string, result: EmailSendResult) {
    await this.patch(id, {
      status: 'sent',
      sent_at: new Date().toISOString(),
      provider_message_id: result.providerMessageId ?? null,
      provider_status: result.status ?? null,
      error: null,
    });
  }

  async markFailed(id: string, error: unknown) {
    await this.patch(id, {
      status: 'failed',
      error: error instanceof Error ? error.message.slice(0, 500) : 'Unknown email failure',
    });
  }

  private async patch(id: string, body: Record<string, unknown>) {
    const response = await fetch(`${this.restBase}email_events?id=eq.${encodeURIComponent(id)}`, {
      method: 'PATCH',
      headers: this.headers({ Prefer: 'return=minimal' }),
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(10000),
      redirect: 'error',
    });
    if (!response.ok) throw new Error(`Email event update failed: ${response.status}`);
  }
}

export class EventLoggedEmailAdapter implements EmailAdapter {
  constructor(
    private readonly provider: EmailAdapter,
    private readonly store: SupabaseEmailEventStore,
  ) {}

  async send(message: EmailMessage): Promise<EmailSendResult> {
    const event = await this.store.createPending(message);
    if (!event) return { status: 'duplicate-skipped' };
    try {
      const result = await this.provider.send(message);
      await this.store.markSent(event.id, result);
      return result;
    } catch (error) {
      await this.store.markFailed(event.id, error).catch(() => undefined);
      throw error;
    }
  }
}
