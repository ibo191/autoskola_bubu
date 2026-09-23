import type { EmailAdapter, EmailMessage, EmailSendResult } from '../../integrations/contracts';

export type EmailEventRow = {
  id: string;
  idempotency_key: string;
  status: 'pending' | 'sent' | 'failed' | 'skipped';
  metadata: Record<string, unknown>;
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

  async listDue(now: Date, limit = 20): Promise<EmailEventRow[]> {
    const params = new URLSearchParams({
      select: 'id,idempotency_key,status,metadata',
      status: 'eq.pending',
      scheduled_for: `lte.${now.toISOString()}`,
      order: 'scheduled_for.asc',
      limit: String(limit),
    });
    const response = await fetch(`${this.restBase}email_events?${params}`, {
      headers: this.headers(),
      signal: AbortSignal.timeout(10000),
      redirect: 'error',
    });
    if (!response.ok) throw new Error(`Email event list failed: ${response.status}`);
    return (await response.json()) as EmailEventRow[];
  }

  async claimDue(id: string, now: Date): Promise<EmailEventRow | null> {
    const params = new URLSearchParams({
      id: `eq.${id}`,
      status: 'eq.pending',
      scheduled_for: `lte.${now.toISOString()}`,
      select: 'id,idempotency_key,status,metadata',
    });
    const response = await fetch(`${this.restBase}email_events?${params}`, {
      method: 'PATCH',
      headers: this.headers({ Prefer: 'return=representation' }),
      body: JSON.stringify({ scheduled_for: new Date(now.getTime() + 60_000).toISOString() }),
      signal: AbortSignal.timeout(10000),
      redirect: 'error',
    });
    if (!response.ok) throw new Error(`Email event claim failed: ${response.status}`);
    const rows = (await response.json()) as EmailEventRow[];
    return rows[0] ?? null;
  }

  async retryLater(event: EmailEventRow, error: unknown, now: Date) {
    const attempts = Number(event.metadata.outboxAttempts ?? 0) + 1;
    const message = error instanceof Error ? error.message.slice(0, 500) : 'Unknown email failure';
    const status = attempts >= 5 ? 'failed' : 'pending';
    const params = new URLSearchParams({ id: `eq.${event.id}`, status: 'eq.pending' });
    const response = await fetch(`${this.restBase}email_events?${params}`, {
      method: 'PATCH',
      headers: this.headers({ Prefer: 'return=minimal' }),
      body: JSON.stringify({
        status,
        scheduled_for: new Date(now.getTime() + 5 * 60_000).toISOString(),
        metadata: { ...event.metadata, outboxAttempts: attempts },
        error: message,
      }),
      signal: AbortSignal.timeout(10000),
      redirect: 'error',
    });
    if (!response.ok) throw new Error(`Email event retry update failed: ${response.status}`);
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
