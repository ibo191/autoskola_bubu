import { z } from 'zod';
export const contactSchema = z
  .object({
    firstName: z.string().trim().min(1).max(80),
    lastName: z.string().trim().min(1).max(80),
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
    website: z.literal('').default(''),
  })
  .strict();
