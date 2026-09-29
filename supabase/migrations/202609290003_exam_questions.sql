-- Keep existing email event types and allow the two exam-question messages.
alter table public.email_events drop constraint if exists email_events_event_type_check;
alter table public.email_events add constraint email_events_event_type_check check (event_type in (
  'order_confirmation', 'internal_new_order', 'contact_form_notification',
  'exam_question_notification', 'exam_question_confirmation',
  'unbooked_reminder_3d', 'unbooked_reminder_7d', 'unbooked_reminder_14d',
  'inactive_order_alert', 'appointment_confirmation', 'appointment_rescheduled',
  'appointment_cancelled', 'appointment_reminder_3d', 'appointment_reminder_same_day',
  'appointment_day_report', 'daily_order_report', 'weekly_order_report', 'monthly_order_report'
));
