import { defineMiddleware } from 'astro:middleware';
import { readConfig } from './lib/config';
// Import-time guard also prevents starting the built server without an explicit local mode.
readConfig(process.env);
export const onRequest = defineMiddleware(async (context, next) => {
  readConfig(process.env);
  const response = await next();
  response.headers.set('X-Content-Type-Options', 'nosniff');
  response.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
  response.headers.set('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  response.headers.set('X-Frame-Options', 'DENY');
  const isProduction =
    process.env.VERCEL_ENV === 'production' || process.env.APP_ENV === 'production';
  if (!isProduction || context.url.pathname.startsWith('/api/')) {
    response.headers.set('X-Robots-Tag', 'noindex, nofollow');
  }
  if (isProduction) {
    response.headers.set('Strict-Transport-Security', 'max-age=63072000; includeSubDomains');
  }
  return response;
});
