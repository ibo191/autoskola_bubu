import type { Selection, Quote } from '../pricing/quote';
import type { z } from 'zod';
import type { contactSchema } from '../validation/contact';
export type Contact = z.infer<typeof contactSchema>;
export type ConsentSnapshot = { version: string; wording: string; accepted: boolean };
export type OrderAddon = {
  id: string;
  title: string;
  quantity: number;
  unitPrice: number;
  total: number;
};
export type ProvisionalInput = {
  slotId: string;
  contact: Contact;
  selection: Selection;
  price: Extract<Quote, { ok: true }>;
  terms: ConsentSnapshot;
  marketing: ConsentSnapshot;
  privacy: ConsentSnapshot;
  addons: OrderAddon[];
  verificationHash: string;
};
export type AvailableSlot = {
  id: string;
  branch: string;
  startsAt: string;
  endsAt: string;
  remaining: number;
};
export type PublicOrderOverview = {
  orderId: string;
  publicCode: string;
  status: string;
  contact: Contact;
  selection: Selection;
  price: Extract<Quote, { ok: true }>;
  addons: OrderAddon[];
  appointment: {
    id: string;
    branch: string;
    status: string;
    startsAt: string;
    endsAt: string;
  } | null;
  createdAt: string;
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
  createProvisional(input: ProvisionalInput): Promise<{
    orderId: string;
    publicCode: string;
    appointmentId: string;
    expiresAt: string;
    startsAt: string;
    endsAt: string;
  }>;
  verifyEmail(hash: string): Promise<{ ok: boolean; orderId?: string }>;
  getPublicOrder(publicCode: string): Promise<PublicOrderOverview | null>;
  rescheduleAppointment(input: {
    publicCode: string;
    slotId: string;
  }): Promise<
    { ok: true; appointmentId: string; startsAt: string; endsAt: string } | { ok: false }
  >;
  cancelAppointment(publicCode: string): Promise<{ ok: boolean }>;
  adminSummary(input: { from: string; to: string; course?: string | null }): Promise<AdminSummary>;
}
