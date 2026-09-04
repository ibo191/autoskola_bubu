import { z } from 'zod';
import type { EmailAdapter, EmailMessage, EmailSendResult } from '../../integrations/contracts';
import { stripHeader } from './utils';

const responseSchema = z
  .object({ message_id: z.string().optional(), status: z.string().optional() })
  .passthrough();

const DEFAULT_FROM = 'Autoškola BuBu <objednavky@autoskolabubu.cz>';

export class LettermintEmailAdapter implements EmailAdapter {
  constructor(private readonly token: string) {
    if (!token) throw new Error('LETTERMINT_PROJECT_TOKEN is missing');
  }

  async send(message: EmailMessage): Promise<EmailSendResult> {
    const response = await fetch('https://api.lettermint.co/v1/send', {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
        'x-lettermint-token': this.token,
        'Idempotency-Key': message.idempotencyKey,
      },
      body: JSON.stringify({
        from: stripHeader(message.from ?? DEFAULT_FROM),
        to: [stripHeader(message.to)],
        reply_to: message.replyTo ? [stripHeader(message.replyTo)] : undefined,
        subject: stripHeader(message.subject),
        html: message.html,
        text: message.text,
        tag: message.tag,
        metadata: message.metadata,
        attachments: message.attachments?.map((attachment) => ({
          filename: stripHeader(attachment.filename),
          content: attachment.content,
          content_type: attachment.contentType ?? 'application/octet-stream',
          content_id: attachment.contentId,
        })),
      }),
      signal: AbortSignal.timeout(12000),
      redirect: 'error',
    });
    if (!response.ok) throw new Error(`Lettermint send failed: ${response.status}`);
    const parsed = responseSchema.safeParse(await response.json().catch(() => ({})));
    if (!parsed.success) return { status: 'accepted' };
    return { providerMessageId: parsed.data.message_id, status: parsed.data.status ?? 'accepted' };
  }
}
