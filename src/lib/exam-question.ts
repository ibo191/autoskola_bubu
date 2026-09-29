import { z } from 'zod';
import { branchId } from './catalog';

const singleLine = z.string().transform((value) =>
  value
    .replace(/[\u0000-\u001f\u007f]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim(),
);

export function normalizeExamPhone(value: string) {
  const compact = value.replace(/[\s().-]/g, '');
  if (!/^\+?\d{8,15}$/.test(compact)) return null;
  if (/^\d{9}$/.test(compact)) return `+420${compact}`;
  if (compact.startsWith('00')) return `+${compact.slice(2)}`;
  return compact.startsWith('+') ? compact : null;
}

export const examQuestionSchema = z
  .object({
    firstName: singleLine.pipe(z.string().min(1).max(80)),
    lastName: singleLine.pipe(z.string().min(1).max(80)),
    email: z.string().trim().toLowerCase().pipe(z.email().max(254)),
    phone: z
      .string()
      .max(30)
      .transform(normalizeExamPhone)
      .pipe(z.string().regex(/^\+[1-9]\d{7,14}$/)),
    branch: branchId,
    message: z
      .string()
      .transform((value) => value.replace(/[\u0000-\u0008\u000b-\u001f\u007f]/g, '').trim())
      .pipe(z.string().min(5).max(2500)),
    website: z.literal(''),
    recaptchaToken: z.string().min(1).max(4096),
  })
  .strict();
