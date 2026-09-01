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
export type AvailableSlot = {
  id: string;
  branch: string;
  startsAt: string;
  endsAt: string;
  remaining: number;
};
export type AdminSummary = {
  ordersTotal: number;
  ordersConfirmed: number;
  appointmentsTotal: number;
  byCourse: { course: string; count: number }[];
  byDay: { date: string; count: number }[];
};
export interface BookingRepository {
  listAvailableSlots(input: { branch: string; from: string; to: string }): Promise<AvailableSlot[]>;
  createProvisional(
    input: ProvisionalInput,
  ): Promise<{ orderId: string; appointmentId: string; expiresAt: string }>;
  verifyEmail(hash: string): Promise<{ ok: boolean; orderId?: string }>;
  adminSummary(input: { from: string; to: string; course?: string | null }): Promise<AdminSummary>;
}
