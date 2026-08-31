import { z } from 'zod';
export const contactSchema = z
  .object({
    firstName: z.string().trim().min(1).max(80),
    lastName: z.string().trim().min(1).max(80),
    email: z
      .email()
      .max(254)
      .transform((value) => value.trim().toLowerCase()),
    phone: z
      .string()
      .transform((value) => value.replace(/[\s()-]/g, ''))
      .pipe(z.string().regex(/^\+[1-9]\d{7,14}$/)),
    website: z.literal('').default(''),
  })
  .strict();
