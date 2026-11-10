import { z } from 'zod';
import { branches, courses, type BranchId, type CourseId, availableAt } from '../catalog';

export const campaignId = z.enum(['black-friday', 'vanoce']);
export type CampaignId = z.infer<typeof campaignId>;

const courseIds = courses
  .filter((course) => course.category !== 'moto' && course.id !== 'kondicni')
  .map((course) => course.id) as CourseId[];
const branchIds = branches.map((branch) => branch.id) as BranchId[];

export const blackFridayCampaign = {
  id: 'black-friday' as const,
  slug: '/black-friday',
  active: true,
  startsAt: null,
  endsAt: null,
  orderLimit: 20,
  bonusLessons: 2,
  bonusMinutesPerLesson: 45,
  bonusValueCzk: 1600,
  headline: 'Black Friday bez slevy. Zato s větší jistotou u zkoušky.',
  badge: '2 jízdy před zkouškou zdarma',
  cta: 'Chci kurz s Black Friday bonusem',
  eligibleCourses: courseIds,
  eligibleBranches: branchIds,
  soldOutCopy: 'Kapacita Black Friday bonusu je naplněná. Kurz si můžete objednat bez bonusu.',
};

export const christmasCampaign = {
  id: 'vanoce' as const,
  slug: '/vanoce',
  active: true,
  startsAt: null,
  endsAt: null,
  depositCzk: 5000,
  pickupBranches: ['strizkov', 'kladno'] as const,
  bonus: {
    id: 'extra-rides',
    lessons: 2,
    minutesPerLesson: 45,
    title: '2 výcvikové hodiny před zkouškou zdarma',
  },
  headline: 'Darujte letos řidičák bez stresu.',
  badge: '2 výcvikové hodiny před zkouškou zdarma',
  cta: 'Chci darovat řidičák',
  eligibleCourses: courseIds,
};

export const campaigns = {
  'black-friday': blackFridayCampaign,
  vanoce: christmasCampaign,
} as const;

export function campaignCourseOptions() {
  return courses
    .filter((course) => course.category !== 'moto' && course.id !== 'kondicni')
    .map((course) => ({ id: course.id, label: course.label, name: course.name }));
}

export function campaignBranchOptions(courseId?: CourseId) {
  const course = courseId ? courses.find((item) => item.id === courseId) : undefined;
  return branches
    .filter((branch) => !course || availableAt(course, branch.id))
    .map((branch) => ({ id: branch.id, name: branch.name, locality: branch.locality }));
}
