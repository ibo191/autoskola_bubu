import type { Selection, Quote } from '../pricing/quote';
import type { z } from 'zod';
import type { contactSchema } from '../validation/contact';
export type Contact = z.infer<typeof contactSchema>;
export type ConsentSnapshot = { version: string; wording: string; accepted: boolean };
export type ProvisionalInput = {
  slotId: string;
  contact: Contact;
  selection: Selection;
  price: Extract<Quote, { ok: true }>;
  terms: ConsentSnapshot;
  marketing: ConsentSnapshot;
  verificationHash: string;
};
export interface BookingRepository {
  createProvisional(
    input: ProvisionalInput,
  ): Promise<{ orderId: string; appointmentId: string; expiresAt: string }>;
  verifyEmail(hash: string): Promise<{ ok: boolean; orderId?: string }>;
}
