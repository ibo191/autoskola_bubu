import type { MarkdownInstance } from 'astro';
import type { AstroComponentFactory } from 'astro/runtime/server/index.js';

type ArticleFrontmatter = {
  title: string;
  description: string;
  slug?: string;
  canonical: string;
  publishedAt: string | Date;
  updatedAt: string | Date;
  author: string;
  category: string;
  branch: 'strizkov' | 'kladno' | 'statenice';
  perex: string;
  sourceUrl: string;
  relatedCourses: string[];
  reviewStatus: 'imported' | 'approved';
  image?: string;
  imageAlt?: string;
};

type ArticleModule = MarkdownInstance<ArticleFrontmatter> & {
  Content?: unknown;
  default?: unknown;
};

export type ArticleEntry = {
  id: string;
  data: Omit<ArticleFrontmatter, 'publishedAt' | 'updatedAt'> & {
    publishedAt: Date;
    updatedAt: Date;
  };
  Content: AstroComponentFactory;
};

const modules = import.meta.glob<ArticleModule>('../content/articles/*.md', { eager: true });

function idFromPath(path: string) {
  return path.split('/').pop()?.replace(/\.md$/, '') ?? path;
}

export function getArticles() {
  return Object.entries(modules)
    .map(([path, module]) => {
      const frontmatter = module.frontmatter;
      return {
        id: frontmatter.slug || idFromPath(path),
        data: {
          ...frontmatter,
          publishedAt: new Date(frontmatter.publishedAt),
          updatedAt: new Date(frontmatter.updatedAt),
        },
        Content: module.Content ?? module.default,
      } satisfies ArticleEntry;
    })
    .sort((a, b) => b.data.publishedAt.getTime() - a.data.publishedAt.getTime());
}

export function getArticle(slug: string) {
  return getArticles().find((article) => article.id === slug) ?? null;
}


