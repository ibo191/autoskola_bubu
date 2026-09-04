import type { EmailAdapter } from '../../integrations/contracts';
import { LocalEmail } from '../../integrations/local';
import { LettermintEmailAdapter } from './lettermint';
import { EventLoggedEmailAdapter, SupabaseEmailEventStore } from './events';

export function isTransactionalEmailConfigured(env: Record<string, string | undefined>) {
  return Boolean(env.LETTERMINT_PROJECT_TOKEN && env.SUPABASE_URL && env.SUPABASE_SERVICE_ROLE_KEY);
}

export function createTransactionalEmailAdapter(
  env: Record<string, string | undefined>,
): EmailAdapter {
  if (isTransactionalEmailConfigured(env)) {
    return new EventLoggedEmailAdapter(
      new LettermintEmailAdapter(env.LETTERMINT_PROJECT_TOKEN!),
      new SupabaseEmailEventStore(env),
    );
  }
  return new LocalEmail({ APP_ENV: 'local', APP_ORIGIN: 'http://127.0.0.1:4321' });
}

export function orderNotificationEmail(env: Record<string, string | undefined>) {
  return env.ORDER_NOTIFICATION_EMAIL || env.GENERAL_CONTACT_EMAIL || 'info@autoskolabubu.cz';
}

export function reportEmailAddress(env: Record<string, string | undefined>) {
  return (
    env.REPORT_EMAIL ||
    env.ORDER_NOTIFICATION_EMAIL ||
    env.GENERAL_CONTACT_EMAIL ||
    'info@autoskolabubu.cz'
  );
}
