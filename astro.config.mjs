import { defineConfig } from 'astro/config';
import node from '@astrojs/node';
import vercel from '@astrojs/vercel';
import { unified } from '@astrojs/markdown-remark';
import redirects from './src/redirects.json' with { type: 'json' };

// Stage A keeps external integrations disabled. Vercel receives only the public preview.
if (process.env.APP_ENV && process.env.APP_ENV !== 'local') {
  throw new Error('Stage A only: production integrations and legal content are not approved.');
}

const isVercelBuild = process.env.VERCEL === '1';

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
  redirects: Object.fromEntries(
    Object.entries(redirects).map(([from, to]) => [from, { status: 301, destination: to }]),
  ),
  security: {
    checkOrigin: true,
    csp: {
      directives: [
        "default-src 'self'",
        "img-src 'self' data:",
        "connect-src 'self'",
        "font-src 'self'",
        "object-src 'none'",
        "base-uri 'self'",
        "form-action 'self'",
      ],
    },
  },
  vite: { server: { host: '127.0.0.1' } },
});
