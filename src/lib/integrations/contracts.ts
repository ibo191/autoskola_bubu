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
export interface EmailMessage {
  idempotencyKey: string;
  to: string;
  subject: string;
  text: string;
}
export interface EmailAdapter {
  send(message: EmailMessage): Promise<void>;
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
