import { branches, courses } from './catalog';
export const publicRoutes = [
  '/',
  '/cenik',
  '/jak-probiha-vyuka',
  '/kontakt',
  '/o-nas',
  '/blog',
  '/black-friday',
  '/vanoce',
  ...branches.map((b) => `/${b.id}`),
  ...courses.map((c) => `/kurzy/${c.slug}`),
];
