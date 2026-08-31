import { z } from 'zod';

export const branchId = z.enum(['strizkov', 'kladno', 'statenice']);
export type BranchId = z.infer<typeof branchId>;
const branchSchema = z.object({
  id: branchId,
  name: z.string().min(1),
  locality: z.string().min(1),
  address: z.string().min(1),
  phone: z.string().regex(/^\+420\d{9}$/),
  email: z.email(),
  hours: z.string().nullable(),
  bPrice: z.number().int().positive(),
});
export const branches = z.array(branchSchema).parse([
  {
    id: 'strizkov',
    name: 'Střížkov',
    locality: 'Praha 8',
    address: 'U Kapliček 34, Praha 8 – Střížkov',
    phone: '+420725717755',
    email: 'strizkov@autoskolabubu.cz',
    hours: 'Pondělí a čtvrtek 15:00–18:00',
    bPrice: 24900,
  },
  {
    id: 'kladno',
    name: 'Kladno',
    locality: 'Kladno',
    address: 'Cyrila Boudy 2954 / Havířská 1141, Kladno',
    phone: '+420725857884',
    email: 'kladno@autoskolabubu.cz',
    hours: null,
    bPrice: 20000,
  },
  {
    id: 'statenice',
    name: 'Statenice',
    locality: 'Praha-západ',
    address: 'Statenická 23, Statenice',
    phone: '+420725703171',
    email: 'statenice@autoskolabubu.cz',
    hours: 'Středa 15:00–18:00',
    bPrice: 24900,
  },
]);
export type Branch = (typeof branches)[number];
export const getBranch = (id: BranchId) => branches.find((b) => b.id === id)!;
export const courseId = z.enum(['b', 'b-automat', 'l17', 'am', 'a1', 'a2', 'a', 'b96', 'be']);
export type CourseId = z.infer<typeof courseId>;
const courseSchema = z.object({
  id: courseId,
  slug: z.string(),
  name: z.string(),
  category: z.enum(['auto', 'moto', 'prives']),
  description: z.string(),
  label: z.string(),
});
export const courses = z.array(courseSchema).parse([
  {
    id: 'b',
    slug: 'ridicak-skupina-b',
    name: 'Řidičák na auto',
    category: 'auto',
    label: 'Skupina B',
    description: 'Teorie, jízdy a příprava ke zkoušce. Od prvního rozjezdu po samostatnou jízdu.',
  },
  {
    id: 'b-automat',
    slug: 'ridicak-skupina-b-automat',
    name: 'Řidičák na automat',
    category: 'auto',
    label: 'B · automat',
    description: 'Soustřeďte se na provoz. Řazení nechte na autě. Na naší pobočce Střížkov.',
  },
  {
    id: 'l17',
    slug: 'l17',
    name: 'Za volant už v 17',
    category: 'auto',
    label: 'B · L17',
    description: 'Kurz skupiny B v režimu L17. Po získání řidičáku jezdíte do 18 let s mentorem.',
  },
  {
    id: 'am',
    slug: 'ridicak-skupina-am',
    name: 'První kilometry na motorce',
    category: 'moto',
    label: 'Skupina AM',
    description: 'Od ovládání motorky k jízdě v provozu. Výcvik na pobočce Střížkov.',
  },
  {
    id: 'a1',
    slug: 'ridicak-skupina-a1',
    name: 'Řidičák na lehkou motorku',
    category: 'moto',
    label: 'Skupina A1',
    description: 'Základy techniky, ovládání a bezpečné jízdy. Výcvik na Střížkově.',
  },
  {
    id: 'a2',
    slug: 'ridicak-skupina-a2',
    name: 'Další krok na dvou kolech',
    category: 'moto',
    label: 'Skupina A2',
    description: 'Vybereme výcvik podle vašeho současného oprávnění a zkušeností.',
  },
  {
    id: 'a',
    slug: 'ridicak-skupina-a',
    name: 'Řidičák na velkou motorku',
    category: 'moto',
    label: 'Skupina A',
    description: 'Nový kurz nebo rozšíření. Správnou cestu určí vaše dosavadní oprávnění.',
  },
  {
    id: 'b96',
    slug: 'b96',
    name: 'Více prostoru pro vaše plány',
    category: 'prives',
    label: 'Rozšíření B96',
    description: 'Rozšíření oprávnění pro jízdní soupravu. V ceně jsou 4 hodiny výcviku.',
  },
  {
    id: 'be',
    slug: 'be',
    name: 'Auto a přívěs',
    category: 'prives',
    label: 'Skupina B+E',
    description: 'Příprava na řízení soupravy s přívěsem. Výcvik na pobočce Střížkov.',
  },
]);
export type Course = (typeof courses)[number];
export const getCourse = (id: CourseId) => courses.find((c) => c.id === id)!;
export const priceSource = {
  url: 'https://www.autoskolabubu.cz/cenik-autoskolabubu',
  checkedAt: '2026-08-28',
  version: 'live-2026-08-28',
};
export const prices = z
  .object({
    motoBasic: z.number().int(),
    motoConfidence: z.number().int(),
    supplement: z.number().int(),
    b96: z.number().int(),
    be: z.number().int(),
  })
  .parse({ motoBasic: 24900, motoConfidence: 31900, supplement: 7500, b96: 8000, be: 10500 });
export const fees = { schoolOrganization: 1000, authorityFirstExam: 700 } as const;
export const examAuthorities = [
  { branch: 'strizkov', office: 'Magistrát hl. m. Prahy', firstExam: 700 },
  { branch: 'statenice', office: 'Městský úřad Černošice', firstExam: 700 },
  { branch: 'kladno', office: 'Magistrát města Kladna', firstExam: 700 },
] as const;
export { money } from '../format';
export function availableAt(course: Course, branch: BranchId) {
  return branch === 'strizkov' || (course.category === 'auto' && course.id !== 'b-automat');
}
export function displayPrice(course: Course, branch: BranchId): number {
  if (!availableAt(course, branch)) throw new Error('Unavailable combination');
  if (course.category === 'auto') return getBranch(branch).bPrice;
  return course.id === 'b96' ? prices.b96 : course.id === 'be' ? prices.be : prices.motoBasic;
}
