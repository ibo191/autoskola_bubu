// Keep Astro telemetry disabled in every documented local command.
process.env.ASTRO_TELEMETRY_DISABLED = '1';
process.env.APP_ENV ??= 'local';
if (process.env.APP_ENV !== 'local' && process.env.VERCEL !== '1') {
  throw new Error('Only local stage A or Vercel preview builds are permitted.');
}
await import('../node_modules/astro/bin/astro.mjs');
