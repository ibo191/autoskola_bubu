import type { APIRoute } from 'astro';
import { getCollection } from 'astro:content';
import { publicRoutes } from '../lib/routes';
export const prerender = true;
export const GET: APIRoute = async () => {
  const articles = await getCollection('articles');
  const routes = [...publicRoutes, ...articles.map((a) => `/blog/${a.id}`)];
  return new Response(
    `<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${routes.map((path) => `<url><loc>https://www.autoskolabubu.cz${path}</loc></url>`).join('')}</urlset>`,
    { headers: { 'Content-Type': 'application/xml; charset=utf-8' } },
  );
};
