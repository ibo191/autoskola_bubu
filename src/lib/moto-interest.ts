import { z } from 'zod';
import { quoteForDisplay } from './pricing/quote';

export const motoInterestSchema = z
  .object({
    firstName: z.string().trim().min(2).max(80),
    lastName: z.string().trim().min(2).max(80),
    email: z.string().trim().toLowerCase().pipe(z.email().max(254)),
    phone: z
      .string()
      .transform((value) => {
        const phone = value.replace(/[\s().-]/g, '');
        if (/^\d{9}$/.test(phone)) return `+420${phone}`;
        if (/^420\d{9}$/.test(phone)) return `+${phone}`;
        if (/^00[1-9]\d{7,14}$/.test(phone)) return `+${phone.slice(2)}`;
        return phone;
      })
      .pipe(z.string().regex(/^\+[1-9]\d{7,14}$/)),
    course: z.enum(['am', 'a1', 'a2', 'a']),
    licenceStatus: z.enum(['none', 'yes']),
    heldLicences: z.array(z.enum(['B', 'AM', 'A1', 'A2', 'A', 'other'])).max(6),
    holdingPeriod: z.enum(['less-than-two', 'more-than-two']).optional(),
    package: z.enum(['moto-basic', 'moto-confidence', 'supplement']),
    source: z.enum(['cenik', 'course', 'direct']),
    notificationConsent: z.literal(true),
    website: z.literal('').default(''),
    recaptchaToken: z.string().max(4096).optional(),
  })
  .strict()
  .superRefine((value, ctx) => {
    if ((value.licenceStatus === 'none') !== (value.heldLicences.length === 0)) {
      ctx.addIssue({ code: 'custom', path: ['heldLicences'], message: 'Zkontrolujte držená oprávnění.' });
      return;
    }
    if (value.course === 'a1' && value.package !== 'moto-confidence') {
      ctx.addIssue({ code: 'custom', path: ['package'], message: 'Pro A1 nabízíme Moto Jistota.' });
      return;
    }
    const result = quoteForDisplay({
      course: value.course,
      branch: 'strizkov',
      heldLicences: value.heldLicences,
      package: value.package,
      ...(value.holdingPeriod ? { holdingPeriod: value.holdingPeriod } : {}),
    });
    if (!result.ok) ctx.addIssue({ code: 'custom', path: ['package'], message: result.message });
  });

export type MotoInterest = z.infer<typeof motoInterestSchema>;

const motoInterestRowSchema = z.object({
  id: z.uuid(),
  created_at: z.iso.datetime({ offset: true }),
  first_name: z.string().nullable(),
  last_name: z.string().nullable(),
  name: z.string(),
  email: z.string(),
  phone: z.string(),
  course: z.enum(['am', 'a1', 'a2', 'a']),
  licence_status: z.enum(['none', 'yes']).nullable(),
  held_licences: z.array(z.string()),
  holding_period: z.string().nullable(),
  package: z.string().nullable(),
  status: z.enum(['waiting', 'notified', 'withdrawn']),
});
export type MotoInterestRow = z.infer<typeof motoInterestRowSchema>;

export async function listMotoInterests(env: Record<string, string | undefined>): Promise<MotoInterestRow[]> {
  if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) throw new Error('Moto interest database is not configured');
  const url = new URL('/rest/v1/moto_interest', env.SUPABASE_URL);
  url.searchParams.set('select', 'id,created_at,first_name,last_name,name,email,phone,course,licence_status,held_licences,holding_period,package,status');
  url.searchParams.set('status', 'eq.waiting');
  url.searchParams.set('order', 'created_at.desc');
  url.searchParams.set('limit', '200');
  const response = await fetch(url, {
    headers: { apikey: env.SUPABASE_SERVICE_ROLE_KEY, Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}` },
    signal: AbortSignal.timeout(10000),
    redirect: 'error',
    cache: 'no-store',
  });
  if (!response.ok) throw new Error(`Moto interest list failed: ${response.status}`);
  return z.array(motoInterestRowSchema).parse(await response.json());
}

export async function saveMotoInterest(
  env: Record<string, string | undefined>,
  input: MotoInterest,
  now: Date,
) {
  if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY)
    throw new Error('Moto interest database is not configured');
  const url = new URL('/rest/v1/moto_interest', env.SUPABASE_URL);
  url.searchParams.set('on_conflict', 'season,email');
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      apikey: env.SUPABASE_SERVICE_ROLE_KEY,
      Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
      'Content-Type': 'application/json',
      Prefer: 'resolution=ignore-duplicates,return=minimal',
    },
    body: JSON.stringify({
      season: 2027,
      name: `${input.firstName} ${input.lastName}`,
      first_name: input.firstName,
      last_name: input.lastName,
      email: input.email,
      phone: input.phone,
      course: input.course,
      licence_status: input.licenceStatus,
      held_licences: input.heldLicences,
      holding_period: input.holdingPeriod ?? null,
      package: input.package,
      source: input.source,
      notification_consent_at: now.toISOString(),
      notification_consent_version: 'MOTO-2027-01',
    }),
    signal: AbortSignal.timeout(10000),
    redirect: 'error',
  });
  if (!response.ok) throw new Error(`Moto interest insert failed: ${response.status}`);
}
