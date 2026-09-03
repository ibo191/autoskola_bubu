import type { APIRoute } from 'astro';
import { loadGoogleReviews } from '../../lib/google/reviews';

export const prerender = false;

export const GET: APIRoute = async () => {
  const payload = await loadGoogleReviews(process.env);
  const cache = payload.configured
    ? 'public, s-maxage=21600, stale-while-revalidate=86400'
    : 'public, s-maxage=300, stale-while-revalidate=1800';

  return new Response(JSON.stringify(payload), {
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': cache,
    },
  });
};
