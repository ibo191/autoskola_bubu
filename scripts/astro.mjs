import { spawnSync } from 'node:child_process';

// Keep Astro telemetry disabled in every documented command.
process.env.ASTRO_TELEMETRY_DISABLED = '1';
process.env.APP_ENV =
  process.env.VERCEL === '1'
    ? process.env.VERCEL_ENV === 'production'
      ? 'production'
      : 'preview'
    : (process.env.APP_ENV ?? 'local');

if (!['local', 'preview', 'production'].includes(process.env.APP_ENV)) {
  throw new Error('APP_ENV must be local, preview or production.');
}

const result = spawnSync(
  process.execPath,
  ['./node_modules/astro/bin/astro.mjs', ...process.argv.slice(2)],
  {
    stdio: 'inherit',
    env: process.env,
  },
);

if (result.error) throw result.error;
process.exit(result.status ?? 1);
