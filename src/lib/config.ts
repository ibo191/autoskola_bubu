import { z } from 'zod';
const schema = z.object({
  APP_ENV: z.enum(['local', 'preview', 'production']),
  APP_ORIGIN: z.url().default('http://127.0.0.1:4321'),
  RECAPTCHA_ADAPTER: z.enum(['local', 'recaptcha']).default('local'),
  EMAIL_ADAPTER: z.enum(['local', 'lettermint']).default('local'),
  ANALYTICS_ADAPTER: z.enum(['noop', 'google-meta']).default('noop'),
});

const localHosts = ['127.0.0.1', 'localhost', '[::1]'];

function normalizeOrigin(value: string | undefined) {
  if (!value) return undefined;
  const origin =
    value.startsWith('http://') || value.startsWith('https://') ? value : `https://${value}`;
  return schema.shape.APP_ORIGIN.safeParse(origin).success ? origin : undefined;
}

function vercelOrigin(env: Record<string, string | undefined>) {
  for (const value of [
    env.APP_ORIGIN,
    env.VERCEL_PROJECT_PRODUCTION_URL,
    env.VERCEL_BRANCH_URL,
    env.VERCEL_URL,
  ]) {
    if (!value) continue;
    const origin = normalizeOrigin(value);
    if (origin) return origin;
  }
  throw new Error('A valid Vercel origin is required.');
}

export function readConfig(env: Record<string, string | undefined>) {
  const isVercel = env.VERCEL === '1';
  const isProductionDeployment = isVercel && env.VERCEL_ENV === 'production';
  const recaptchaConfigured = Boolean(env.RECAPTCHA_SECRET_KEY && env.PUBLIC_RECAPTCHA_SITE_KEY);
  const value = schema.parse(
    isVercel
      ? {
          ...env,
          APP_ENV: isProductionDeployment ? 'production' : 'preview',
          APP_ORIGIN: vercelOrigin(env),
          // These are deployment-owned choices. Do not let obsolete Vercel variables such as
          // "smtp" or "gtm" break prerendering; production secrets are checked below.
          RECAPTCHA_ADAPTER: isProductionDeployment && recaptchaConfigured ? 'recaptcha' : 'local',
          EMAIL_ADAPTER: isProductionDeployment ? 'lettermint' : 'local',
          ANALYTICS_ADAPTER: isProductionDeployment ? 'google-meta' : 'noop',
        }
      : env,
  );
  const host = new URL(value.APP_ORIGIN).hostname;
  if (value.APP_ENV === 'local' && !localHosts.includes(host))
    throw new Error('Local origin required');
  if (value.APP_ENV !== 'local' && new URL(value.APP_ORIGIN).protocol !== 'https:')
    throw new Error('Preview and production origins must use HTTPS');
  if (
    value.APP_ENV === 'local' &&
    env.SUPABASE_URL &&
    !localHosts.includes(new URL(env.SUPABASE_URL).hostname)
  )
    throw new Error('Cloud database is forbidden in stage A');
  if (value.APP_ENV === 'production') {
    const missing = [
      'SUPABASE_URL',
      'SUPABASE_SERVICE_ROLE_KEY',
      'RATE_LIMIT_SECRET',
      'LETTERMINT_PROJECT_TOKEN',
      'ORDER_NOTIFICATION_EMAIL',
      'CRON_SECRET',
    ].filter((key) => !env[key]);
    if (missing.length)
      throw new Error(`Missing required production environment variables: ${missing.join(', ')}`);
  }
  return value;
}
