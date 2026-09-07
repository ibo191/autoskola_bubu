import { z } from 'zod';
import { branches, courses, type BranchId, type CourseId, availableAt } from '../catalog';

export const campaignId = z.enum(['black-friday', 'vanoce']);
export type CampaignId = z.infer<typeof campaignId>;

const courseIds = courses.map((course) => course.id) as CourseId[];
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
  packagingAndDeliveryCzk: 200,
  onlineTotalCzk: 5200,
  headline: 'Darujte letos řidičák bez stresu.',
  badge: '+ Vánoční bonus až 1 800 Kč',
  cta: 'Chci darovat řidičák',
  eligibleCourses: courseIds,
  eligibleBranches: branchIds,
  bonusVariants: [
    {
      id: 'extra-rides',
      title: '2 × 45 min extra jízdy',
      valueCzk: 1600,
      description: 'Víc klidu před závěrečnou zkouškou a prostor doladit slabší místa.',
    },
    {
      id: 'mock-exam-plus-ride',
      title: 'Zkouška nanečisto + 45 min extra jízda',
      valueCzk: 1800,
      description:
        'Test na pobočce a simulovaná zkoušková jízda, aby obdarovaný věděl, co ho čeká.',
    },
  ],
};

export const campaigns = {
  'black-friday': blackFridayCampaign,
  vanoce: christmasCampaign,
} as const;

export function campaignCourseOptions() {
  return courses.map((course) => ({ id: course.id, label: course.label, name: course.name }));
}

export function campaignBranchOptions(courseId?: CourseId) {
  const course = courseId ? courses.find((item) => item.id === courseId) : undefined;
  return branches
    .filter((branch) => !course || availableAt(course, branch.id))
    .map((branch) => ({ id: branch.id, name: branch.name, locality: branch.locality }));
}
