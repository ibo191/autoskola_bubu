-- Preserve historical daily events; allow future reports to be identified as weekly.
alter table public.email_events
  drop constraint if exists email_events_event_type_check;

alter table public.email_events
  add constraint email_events_event_type_check check (event_type in (
    'order_confirmation',
    'internal_new_order',
    'contact_form_notification',
    'unbooked_reminder_3d',
    'unbooked_reminder_7d',
    'unbooked_reminder_14d',
    'inactive_order_alert',
    'appointment_confirmation',
    'appointment_rescheduled',
    'appointment_cancelled',
    'appointment_reminder_3d',
    'appointment_reminder_same_day',
    'daily_order_report',
    'weekly_order_report',
    'monthly_order_report'
  ));

create unique index if not exists email_events_weekly_report_once
  on public.email_events(event_type, report_date)
  where event_type = 'weekly_order_report' and report_date is not null;
