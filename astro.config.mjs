import { defineConfig } from 'astro/config';
import node from '@astrojs/node';
import vercel from '@astrojs/vercel';
import { unified } from '@astrojs/markdown-remark';
import redirects from './src/redirects.json' with { type: 'json' };

// Vercel previews stay isolated; production gets its environment from the deployment target.
const isVercelBuild = process.env.VERCEL === '1';

if (process.env.APP_ENV && !['local', 'preview', 'production'].includes(process.env.APP_ENV)) {
  throw new Error('APP_ENV must be local, preview or production.');
}

export default defineConfig({
  site: 'https://www.autoskolabubu.cz',
  output: 'server',
  adapter: isVercelBuild
    ? vercel({ maxDuration: 10, imageService: true })
    : node({ mode: 'standalone', bodySizeLimit: 16384 }),
  session: false,
  devToolbar: { enabled: false },
  markdown: { processor: unified(), syntaxHighlight: false },
  trailingSlash: 'never',
  // Browsers percent-encode Czech characters in legacy Wix paths. Register both
  // forms so each old URL reaches its relevant replacement page.
  redirects: Object.fromEntries(
    Object.entries(redirects).flatMap(([from, to]) =>
      [...new Set([from, encodeURI(from)])].map((legacyPath) => [
        legacyPath,
        { status: 301, destination: to },
      ]),
    ),
  ),
  security: {
    checkOrigin: true,
    csp: {
      scriptDirective: {
        resources: [
          "'self'",
          "'unsafe-inline'",
          'https://www.google.com',
          'https://www.gstatic.com',
          'https://www.recaptcha.net',
          'https://www.googletagmanager.com',
        ],
      },
      directives: [
        "default-src 'self'",
        "img-src 'self' data: https://www.google.com https://www.gstatic.com https://www.recaptcha.net https://www.google-analytics.com",
        "connect-src 'self' https://www.google.com https://www.gstatic.com https://www.recaptcha.net https://www.googletagmanager.com https://www.google-analytics.com https://region1.google-analytics.com",
        "font-src 'self'",
        "object-src 'none'",
        "base-uri 'self'",
        "form-action 'self'",
        'frame-src https://www.google.com https://www.gstatic.com https://www.recaptcha.net https://maps.google.com',
      ],
    },
  },
  vite: { server: { host: '127.0.0.1' } },
});
