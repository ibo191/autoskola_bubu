import { spawnSync } from 'node:child_process';

// Keep Astro telemetry disabled in every documented local command.
process.env.ASTRO_TELEMETRY_DISABLED = '1';
process.env.APP_ENV = process.env.VERCEL === '1' ? 'preview' : (process.env.APP_ENV ?? 'local');

if (!['local', 'preview'].includes(process.env.APP_ENV)) {
  throw new Error('Only local or preview builds are permitted before production launch.');
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
