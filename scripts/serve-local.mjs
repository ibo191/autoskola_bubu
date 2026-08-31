process.env.APP_ENV ??= 'local';
if(process.env.APP_ENV!=='local')throw new Error('Stage A server only accepts local mode.');
process.env.HOST='127.0.0.1';
process.env.PORT='4322';
process.env.ASTRO_TELEMETRY_DISABLED='1';
await import('../dist/server/entry.mjs');
