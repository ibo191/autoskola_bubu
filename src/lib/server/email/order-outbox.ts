import { z } from 'zod';
import type { EmailAdapter, EmailMessage, EmailSendResult } from '../../integrations/contracts';
import { applicationFormAttachment } from './attachments';
import { SupabaseEmailEventStore, type EmailEventRow } from './events';
import { LettermintEmailAdapter } from './lettermint';

const storedMessageSchema = z.object({
  idempotencyKey: z.string().min(1),
  to: z.email(),
  subject: z.string().min(1),
  text: z.string(),
  html: z.string().optional(),
  from: z.string().optional(),
  replyTo: z.string().optional(),
  tag: z.string().optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
  eventType: z.enum(['order_confirmation', 'internal_new_order']),
  orderId: z.uuid(),
  appointmentId: z.uuid().optional(),
});

type OutboxStore = Pick<
  SupabaseEmailEventStore,
  'createPending' | 'listDue' | 'claimDue' | 'markSent' | 'markFailed' | 'retryLater'
>;

export class OrderEmailOutbox implements EmailAdapter {
  constructor(
    private readonly provider: EmailAdapter,
    private readonly store: OutboxStore,
    private readonly schedule?: (task: Promise<unknown>) => void,
  ) {}

  async send(message: EmailMessage): Promise<EmailSendResult> {
    if (message.eventType !== 'order_confirmation' && message.eventType !== 'internal_new_order')
      throw new Error('Unsupported order outbox event');
    const { attachments: _attachments, scheduledFor: _scheduledFor, ...snapshot } = message;
    const event = await this.store.createPending({
      ...message,
      attachments: undefined,
      scheduledFor: new Date().toISOString(),
      metadata: {
        ...message.metadata,
        outboxMessage: snapshot,
        outboxAttempts: 0,
      },
    });
    if (!event) return { status: 'duplicate-skipped' };
    if (this.schedule) {
      const task = this.deliver(event.id);
      this.schedule(task);
    }
    return { status: 'queued' };
  }

  async deliver(id: string): Promise<'sent' | 'retry' | 'skipped'> {
    const event = await this.store.claimDue(id, new Date());
    if (!event) return 'skipped';
    const parsed = storedMessageSchema.safeParse(event.metadata.outboxMessage);
    if (!parsed.success || parsed.data.idempotencyKey !== event.idempotency_key) {
      await this.store.markFailed(id, new Error('Invalid order email outbox payload'));
      return 'skipped';
    }
    const message: EmailMessage = parsed.data;
    try {
      if (message.eventType === 'order_confirmation') {
        message.attachments = [await applicationFormAttachment()];
      }
      const result = await this.provider.send(message);
      await this.store.markSent(id, result);
      return 'sent';
    } catch (error) {
      await this.store.retryLater(event, error, new Date());
      console.warn('order_email_retry_scheduled', {
        orderId: message.orderId,
        eventType: message.eventType,
        error: error instanceof Error ? error.message : 'unknown',
      });
      return 'retry';
    }
  }

  async drainDue(now = new Date()) {
    const events = await this.store.listDue(now, 100);
    const due = events.filter((event: EmailEventRow) => event.metadata?.outboxMessage);
    const results = await Promise.allSettled(due.map((event) => this.deliver(event.id)));
    return {
      checked: due.length,
      sent: results.filter((result) => result.status === 'fulfilled' && result.value === 'sent')
        .length,
      retry: results.filter((result) => result.status === 'fulfilled' && result.value === 'retry')
        .length,
      errors: results.filter((result) => result.status === 'rejected').length,
    };
  }
}

export function createOrderEmailOutbox(
  env: Record<string, string | undefined>,
  schedule?: (task: Promise<unknown>) => void,
) {
  if (!env.LETTERMINT_PROJECT_TOKEN) throw new Error('Order email provider is not configured');
  return new OrderEmailOutbox(
    new LettermintEmailAdapter(env.LETTERMINT_PROJECT_TOKEN),
    new SupabaseEmailEventStore(env),
    schedule,
  );
}
