import { z } from 'zod';
const schema = z.object({
  APP_ENV: z.literal('local'),
  APP_ORIGIN: z.url().default('http://127.0.0.1:4321'),
  RECAPTCHA_ADAPTER: z.literal('local').default('local'),
  EMAIL_ADAPTER: z.literal('local').default('local'),
  ANALYTICS_ADAPTER: z.literal('noop').default('noop'),
});
export function readConfig(env: Record<string, string | undefined>) {
  const isVercelPreview = env.VERCEL === '1';
  const value = schema.parse(
    isVercelPreview
      ? {
          ...env,
          APP_ENV: 'local',
          APP_ORIGIN:
            env.APP_ORIGIN ??
            (env.VERCEL_URL ? `https://${env.VERCEL_URL}` : 'https://autoskolabubu.cz'),
          RECAPTCHA_ADAPTER: 'local',
          EMAIL_ADAPTER: 'local',
          ANALYTICS_ADAPTER: 'noop',
        }
      : env,
  );
  const host = new URL(value.APP_ORIGIN).hostname;
  if (!isVercelPreview && !['127.0.0.1', 'localhost', '[::1]'].includes(host))
    throw new Error('Local origin required');
  if (
    env.SUPABASE_URL &&
    !['127.0.0.1', 'localhost', '[::1]'].includes(new URL(env.SUPABASE_URL).hostname)
  )
    throw new Error('Cloud database is forbidden in stage A');
  return value;
}
