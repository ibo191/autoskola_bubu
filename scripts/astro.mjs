// Keep Astro telemetry disabled in every documented local command.
process.env.ASTRO_TELEMETRY_DISABLED = '1';
process.env.APP_ENV ??= 'local';
if (process.env.APP_ENV !== 'local') throw new Error('Only local stage A is permitted.');
await import('../node_modules/astro/bin/astro.mjs');
