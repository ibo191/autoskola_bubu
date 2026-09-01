import { defineCollection } from 'astro:content';
import { z } from 'zod';
import { glob } from 'astro/loaders';
const articles = defineCollection({
  loader: glob({ pattern: '**/*.md', base: './src/content/articles' }),
  schema: z.object({
    title: z.string(),
    description: z.string(),
    slug: z.string(),
    canonical: z.url(),
    publishedAt: z.coerce.date(),
    updatedAt: z.coerce.date(),
    author: z.string(),
    category: z.string(),
    branch: z.enum(['strizkov', 'kladno', 'statenice']),
    perex: z.string(),
    sourceUrl: z.url(),
    relatedCourses: z.array(z.string()),
    reviewStatus: z.enum(['imported', 'approved']),
    image: z.string().optional(),
    imageAlt: z.string().optional(),
  }),
});
export const collections = { articles };
