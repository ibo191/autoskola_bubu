import { defineMiddleware } from 'astro:middleware';
import { readConfig } from './lib/config';
// Import-time guard also prevents starting the built server without an explicit local mode.
readConfig(process.env);
export const onRequest = defineMiddleware(async (_context, next) => {
  readConfig(process.env);
  const response = await next();
  response.headers.set('X-Content-Type-Options', 'nosniff');
  response.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
  response.headers.set('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  response.headers.set('X-Frame-Options', 'DENY');
  response.headers.set('X-Robots-Tag', 'noindex');
  // No HSTS on local HTTP. Production HTTPS policy belongs to stage B.
  return response;
});
