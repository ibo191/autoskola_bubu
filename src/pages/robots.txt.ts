import type { APIRoute } from 'astro';
export const prerender = true;
// Stage A is deliberately not indexable. Launch policy changes only in stage B.
export const GET: APIRoute = () =>
  new Response('User-agent: *\nDisallow: /\n', {
    headers: { 'Content-Type': 'text/plain; charset=utf-8' },
  });
