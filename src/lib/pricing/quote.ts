import { z } from 'zod';
import {
  branchId,
  courseId,
  getCourse,
  availableAt,
  getBranch,
  prices,
  fees,
  priceSource,
} from '../catalog/index';

export const selectionSchema = z
  .object({
    course: courseId,
    branch: branchId,
    transmission: z.enum(['manual', 'automatic']).optional(),
    package: z.enum(['single', 'moto-basic', 'moto-confidence', 'supplement']).default('single'),
    heldLicences: z
      .array(z.enum(['B', 'AM', 'A1', 'A2', 'A', 'other']))
      .max(6)
      .default([]),
    holdingPeriod: z.enum(['less-than-two', 'exactly-two', 'more-than-two', 'unknown']).optional(),
  })
  .strict()
  .transform((value) => ({
    ...value,
    transmission: value.transmission ?? (value.course === 'b-automat' ? 'automatic' : 'manual'),
  }));
export type Selection = z.infer<typeof selectionSchema>;
export type Quote =
  | {
      ok: true;
      amount: number;
      currency: 'CZK';
      package: Selection['package'];
      training: 'standard' | 'extension' | 'supplement';
      extraTheoryHours: number;
      schoolFee: number;
      authorityFee: number;
      priceVersion: string;
    }
  | {
      ok: false;
      code: 'INVALID_SELECTION' | 'UNAVAILABLE' | 'CONTACT_REQUIRED' | 'PACKAGE_REQUIRED';
      message: string;
      allowedPackages?: Selection['package'][];
    };

export function quote(input: unknown): Quote {
  const parsed = selectionSchema.safeParse(input);
  if (!parsed.success)
    return {
      ok: false,
      code: 'INVALID_SELECTION',
      message: 'Zkontrolujte vybraný kurz a pobočku.',
    };
  const s = parsed.data,
    course = getCourse(s.course);
  if (
    !availableAt(course, s.branch) ||
    (s.course === 'b' && s.transmission !== 'manual') ||
    (s.course === 'b-automat' && s.transmission !== 'automatic') ||
    (s.transmission === 'automatic' && (s.branch !== 'strizkov' || course.category !== 'auto'))
  )
    return {
      ok: false,
      code: 'UNAVAILABLE',
      message: 'Tato kombinace kurzu a pobočky není dostupná.',
    };
  const result = (
    amount: number,
    training: 'standard' | 'extension' | 'supplement' = 'standard',
    extraTheoryHours = 0,
  ): Quote => ({
    ok: true,
    amount,
    currency: 'CZK',
    package: s.package,
    training,
    extraTheoryHours,
    schoolFee: fees.schoolOrganization,
    authorityFee: fees.authorityFirstExam,
    priceVersion: priceSource.version,
  });
  const choose = (allowed: Selection['package'][]): Quote => ({
    ok: false,
    code: 'PACKAGE_REQUIRED',
    message: 'Vyberte odpovídající variantu výcviku.',
    allowedPackages: allowed,
  });
  if (course.category !== 'moto') {
    if (s.package !== 'single') return choose(['single']);
    if (course.category === 'auto') return result(getBranch(s.branch).bPrice);
    return result(s.course === 'b96' ? prices.b96 : prices.be, 'extension');
  }
  if (new Set(s.heldLicences).size !== s.heldLicences.length || s.heldLicences.includes('other'))
    return {
      ok: false,
      code: 'CONTACT_REQUIRED',
      message: 'Tuto kombinaci oprávnění s vámi potřebujeme ověřit. Kontaktujte Střížkov.',
    };
  if (s.heldLicences.length === 0) {
    if (s.package !== 'moto-confidence') return choose(['moto-confidence']);
    return result(prices.motoConfidence, 'standard', 2);
  }
  const ranks = { AM: 0, A1: 1, A2: 2, A: 3 } as const;
  const targetRanks = { am: 0, a1: 1, a2: 2, a: 3 } as const;
  const heldMoto = s.heldLicences
    .filter((licence): licence is keyof typeof ranks => licence in ranks)
    .sort((a, b) => ranks[b] - ranks[a])[0];
  if (heldMoto && ranks[heldMoto] >= targetRanks[s.course as keyof typeof targetRanks])
    return {
      ok: false,
      code: 'CONTACT_REQUIRED',
      message: 'Zvolenou nebo vyšší motocyklovou skupinu už držíte. Správný postup ověří Střížkov.',
    };
  const direct =
    (heldMoto === 'A1' && s.course === 'a2') || (heldMoto === 'A2' && s.course === 'a');
  if (direct && (!s.holdingPeriod || ['unknown', 'exactly-two'].includes(s.holdingPeriod)))
    return {
      ok: false,
      code: 'CONTACT_REQUIRED',
      message: 'Délku držení oprávnění ověří pobočka před výběrem výcviku.',
    };
  if (direct && s.holdingPeriod === 'more-than-two') {
    if (s.package !== 'supplement') return choose(['supplement']);
    return result(prices.supplement, 'supplement');
  }
  if (!['moto-basic', 'moto-confidence'].includes(s.package))
    return choose(['moto-basic', 'moto-confidence']);
  return result(s.package === 'moto-basic' ? prices.motoBasic : prices.motoConfidence, 'extension');
}
