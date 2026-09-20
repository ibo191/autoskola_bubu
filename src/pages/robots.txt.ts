import type { APIRoute } from 'astro';
export const prerender = true;
const isProduction =
  process.env.VERCEL_ENV === 'production' || process.env.APP_ENV === 'production';
export const GET: APIRoute = () =>
  new Response(
    isProduction
      ? 'User-agent: *\nAllow: /\nSitemap: https://www.autoskolabubu.cz/sitemap-index.xml\n'
      : 'User-agent: *\nDisallow: /\n',
    {
      headers: { 'Content-Type': 'text/plain; charset=utf-8' },
    },
  );
