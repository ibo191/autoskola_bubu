export type CaptchaAction =
  | 'create_order'
  | 'verify_email'
  | 'resend_verification'
  | 'reschedule_appointment'
  | 'cancel_appointment';
export interface CaptchaAdapter {
  verify(input: {
    token: string;
    action: CaptchaAction;
    hostname: string;
    now: Date;
  }): Promise<boolean>;
}
export type EmailEventType =
  | 'order_confirmation'
  | 'internal_new_order'
  | 'contact_form_notification'
  | 'unbooked_reminder_3d'
  | 'unbooked_reminder_7d'
  | 'unbooked_reminder_14d'
  | 'inactive_order_alert'
  | 'appointment_confirmation'
  | 'appointment_rescheduled'
  | 'appointment_cancelled'
  | 'appointment_reminder_3d'
  | 'appointment_reminder_same_day'
  | 'daily_order_report'
  | 'monthly_order_report';
export interface EmailMessage {
  idempotencyKey: string;
  to: string;
  subject: string;
  text: string;
  html?: string;
  from?: string;
  replyTo?: string;
  tag?: string;
  metadata?: Record<string, unknown>;
  eventType?: EmailEventType;
  orderId?: string;
  appointmentId?: string;
  scheduledFor?: string;
  reportDate?: string;
  reportMonth?: string;
  attachments?: { filename: string; content: string; contentType?: string; contentId?: string }[];
}
export type EmailSendResult = { providerMessageId?: string | null; status?: string | null };
export interface EmailAdapter {
  send(message: EmailMessage): Promise<EmailSendResult>;
}
export interface AnalyticsAdapter {
  track(
    name:
      | 'order_opened'
      | 'course_selected'
      | 'slot_selected'
      | 'order_submitted'
      | 'email_verified'
      | 'appointment_confirmed'
      | 'appointment_changed'
      | 'appointment_cancelled',
    parameters: { course?: string; branch?: string },
  ): void;
}
export interface JobRepository {
  claimDue(now: Date, limit: number): Promise<{ id: string; message: EmailMessage }[]>;
  complete(id: string): Promise<void>;
  retry(id: string): Promise<void>;
}
