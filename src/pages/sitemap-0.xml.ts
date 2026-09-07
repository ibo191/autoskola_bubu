import type { APIRoute } from 'astro';
import { getArticles } from '../lib/articles';
import { publicRoutes } from '../lib/routes';
export const prerender = true;
export const GET: APIRoute = async () => {
  const routes = [...publicRoutes, ...getArticles().map((article) => `/blog/${article.id}`)];
  return new Response(
    `<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${routes.map((path) => `<url><loc>https://www.autoskolabubu.cz${path}</loc></url>`).join('')}</urlset>`,
    { headers: { 'Content-Type': 'application/xml; charset=utf-8' } },
  );
};
