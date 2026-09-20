import type { APIRoute } from 'astro';
import { getArticles } from '../lib/articles';
import { publicRoutes } from '../lib/routes';
export const prerender = true;
export const GET: APIRoute = async () => {
  const staticRoutes = publicRoutes.map((path) => ({ path, lastmod: undefined }));
  const articleRoutes = getArticles().map((article) => ({
    path: `/blog/${article.id}`,
    lastmod: article.data.updatedAt.toISOString().slice(0, 10),
  }));
  const routes = [...staticRoutes, ...articleRoutes];
  return new Response(
    `<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${routes.map(({ path, lastmod }) => `<url><loc>https://www.autoskolabubu.cz${path}</loc>${lastmod ? `<lastmod>${lastmod}</lastmod>` : ''}</url>`).join('')}</urlset>`,
    { headers: { 'Content-Type': 'application/xml; charset=utf-8' } },
  );
};
