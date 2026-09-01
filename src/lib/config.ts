import { z } from 'zod';
const schema = z.object({
  APP_ENV: z.enum(['local', 'preview']),
  APP_ORIGIN: z.url().default('http://127.0.0.1:4321'),
  RECAPTCHA_ADAPTER: z.literal('local').default('local'),
  EMAIL_ADAPTER: z.literal('local').default('local'),
  ANALYTICS_ADAPTER: z.literal('noop').default('noop'),
});

const localHosts = ['127.0.0.1', 'localhost', '[::1]'];

function normalizeOrigin(value: string | undefined) {
  if (!value) return undefined;
  const origin = value.startsWith('http://') || value.startsWith('https://') ? value : `https://${value}`;
  return schema.shape.APP_ORIGIN.safeParse(origin).success ? origin : undefined;
}

function vercelOrigin(env: Record<string, string | undefined>) {
  for (const value of [env.APP_ORIGIN, env.VERCEL_PROJECT_PRODUCTION_URL, env.VERCEL_BRANCH_URL, env.VERCEL_URL]) {
    if (!value) continue;
    const origin = normalizeOrigin(value);
    if (origin) return origin;
  }
  throw new Error('A valid Vercel origin is required for preview builds.');
}

export function readConfig(env: Record<string, string | undefined>) {
  const isVercelPreview = env.VERCEL === '1';
  const value = schema.parse(
    isVercelPreview
      ? {
          ...env,
          APP_ENV: 'preview',
          APP_ORIGIN: vercelOrigin(env),
          RECAPTCHA_ADAPTER: 'local',
          EMAIL_ADAPTER: 'local',
          ANALYTICS_ADAPTER: 'noop',
        }
      : env,
  );
  const host = new URL(value.APP_ORIGIN).hostname;
  if (value.APP_ENV === 'local' && !localHosts.includes(host)) throw new Error('Local origin required');
  if (value.APP_ENV === 'preview' && new URL(value.APP_ORIGIN).protocol !== 'https:')
    throw new Error('Preview origin must use HTTPS');
  if (
    env.SUPABASE_URL &&
    !localHosts.includes(new URL(env.SUPABASE_URL).hostname)
  )
    throw new Error('Cloud database is forbidden in stage A');
  return value;
}
