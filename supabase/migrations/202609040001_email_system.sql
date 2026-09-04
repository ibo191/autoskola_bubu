-- Transactional email log, idempotency and scheduled email/report helpers.

create table if not exists public.email_events (
  id uuid primary key default gen_random_uuid(),
  idempotency_key text not null unique,
  order_id uuid references public.orders(id) on delete set null,
  appointment_id uuid references public.appointments(id) on delete set null,
  event_type text not null check (event_type in (
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
    'monthly_order_report'
  )),
  recipient text not null check (length(recipient) between 3 and 254),
  subject text not null check (length(subject) between 1 and 254),
  status text not null default 'pending' check (status in ('pending','sent','failed','skipped')),
  provider_message_id text,
  provider_status text,
  error text,
  scheduled_for timestamptz not null default clock_timestamp(),
  sent_at timestamptz,
  report_date date,
  report_month text,
  metadata jsonb not null default '{}'::jsonb check (jsonb_typeof(metadata)='object'),
  created_at timestamptz not null default clock_timestamp()
);

alter table public.email_events enable row level security;
revoke all on public.email_events from public, anon, authenticated;
grant select, insert, update, delete on public.email_events to service_role;

create index if not exists email_events_status_due on public.email_events(status, scheduled_for);
create index if not exists email_events_order_type on public.email_events(order_id, event_type);
create index if not exists email_events_appointment_type on public.email_events(appointment_id, event_type);
create unique index if not exists email_events_daily_report_once on public.email_events(event_type, report_date)
  where event_type = 'daily_order_report' and report_date is not null;
create unique index if not exists email_events_monthly_report_once on public.email_events(event_type, report_month)
  where event_type = 'monthly_order_report' and report_month is not null;

create or replace function bubu_private.order_email_payload(o public.orders) returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'orderId', o.id,
    'publicCode', o.public_code,
    'status', o.status,
    'contact', jsonb_build_object('firstName', o.first_name, 'lastName', o.last_name, 'email', o.email, 'phone', o.phone),
    'selection', o.selection,
    'price', o.price_snapshot,
    'addons', coalesce((
      select jsonb_agg(jsonb_build_object('id', i.product_id, 'title', i.title, 'quantity', i.quantity, 'unitPrice', i.unit_price_czk, 'total', i.total_czk) order by i.title)
      from public.order_items i where i.order_id = o.id
    ), '[]'::jsonb),
    'appointment', (
      select jsonb_build_object('id', a.id, 'branch', a.branch, 'status', a.status, 'startsAt', s.starts_at, 'endsAt', s.ends_at)
      from public.appointments a join public.appointment_slots s on s.id = a.slot_id
      where a.order_id = o.id and a.status not in ('expired','cancelled')
      limit 1
    ),
    'createdAt', o.created_at
  )
$$;
revoke all on function bubu_private.order_email_payload(public.orders) from public, anon, authenticated;
grant execute on function bubu_private.order_email_payload(public.orders) to service_role;

create or replace function public.bubu_email_appointment_reminders(p_local_date date) returns jsonb
language sql stable security definer set search_path = '' as $$
  select coalesce(jsonb_agg(bubu_private.order_email_payload(o) order by s.starts_at), '[]'::jsonb)
  from public.orders o
  join public.appointments a on a.order_id = o.id
  join public.appointment_slots s on s.id = a.slot_id
  where o.status not in ('cancelled','expired','attended','no_show')
    and a.status not in ('cancelled','expired','attended','no_show')
    and (s.starts_at at time zone 'Europe/Prague')::date in (p_local_date, p_local_date + 3)
    and s.starts_at > clock_timestamp();
$$;
revoke all on function public.bubu_email_appointment_reminders(date) from public, anon, authenticated;
grant execute on function public.bubu_email_appointment_reminders(date) to service_role;

create or replace function public.bubu_email_unbooked_orders(p_local_date date) returns jsonb
language sql stable security definer set search_path = '' as $$
  select coalesce(jsonb_agg(bubu_private.order_email_payload(o) order by o.created_at), '[]'::jsonb)
  from public.orders o
  where o.status not in ('cancelled','expired','attended','no_show','enrolled')
    and not exists (
      select 1 from public.appointments a
      where a.order_id = o.id and a.status not in ('cancelled','expired')
    )
    and (o.created_at at time zone 'Europe/Prague')::date in (
      p_local_date - 3,
      p_local_date - 7,
      p_local_date - 14,
      p_local_date - 15
    );
$$;
revoke all on function public.bubu_email_unbooked_orders(date) from public, anon, authenticated;
grant execute on function public.bubu_email_unbooked_orders(date) to service_role;

create or replace function public.bubu_email_order_report(p_from date, p_to date, p_days integer default 1) returns jsonb
language sql stable security definer set search_path = '' as $$
  with scoped as (
    select
      o.*,
      (o.created_at at time zone 'Europe/Prague')::date as local_date,
      exists (
        select 1 from public.appointments a
        where a.order_id = o.id and a.status not in ('cancelled','expired')
      ) as has_appointment
    from public.orders o
    where (o.created_at at time zone 'Europe/Prague')::date >= p_from
      and (o.created_at at time zone 'Europe/Prague')::date < p_to
  ), totals as (
    select
      count(*)::integer as orders_total,
      coalesce(sum(total_czk), 0)::integer as orders_value,
      coalesce(avg(total_czk), 0)::numeric as average_value,
      count(*) filter (where has_appointment)::integer as booked,
      count(*) filter (where not has_appointment)::integer as without_appointment,
      count(*) filter (where status = 'cancelled')::integer as cancelled
    from scoped
  ), by_course as (
    select coalesce(jsonb_agg(jsonb_build_object('key', course, 'count', c, 'valueCzk', value_czk) order by c desc, course), '[]'::jsonb) as value
    from (select course, count(*)::integer c, coalesce(sum(total_czk), 0)::integer value_czk from scoped group by course) x
  ), by_branch as (
    select coalesce(jsonb_agg(jsonb_build_object('key', branch, 'count', c, 'valueCzk', value_czk) order by c desc, branch), '[]'::jsonb) as value
    from (select branch, count(*)::integer c, coalesce(sum(total_czk), 0)::integer value_czk from scoped group by branch) x
  ), by_package as (
    select coalesce(jsonb_agg(jsonb_build_object('key', package, 'count', c, 'valueCzk', value_czk) order by c desc, package), '[]'::jsonb) as value
    from (select package, count(*)::integer c, coalesce(sum(total_czk), 0)::integer value_czk from scoped group by package) x
  ), by_day as (
    select local_date, count(*)::integer c, coalesce(sum(total_czk), 0)::integer value_czk from scoped group by local_date
  ), strongest_orders as (
    select jsonb_build_object('date', local_date, 'count', c) as value from by_day order by c desc, local_date limit 1
  ), strongest_value as (
    select jsonb_build_object('date', local_date, 'valueCzk', value_czk) as value from by_day order by value_czk desc, local_date limit 1
  )
  select jsonb_build_object(
    'ordersTotal', totals.orders_total,
    'ordersValueCzk', totals.orders_value,
    'averageOrderValueCzk', totals.average_value,
    'bookedAppointments', totals.booked,
    'withoutAppointment', totals.without_appointment,
    'cancelledOrders', totals.cancelled,
    'byCourse', by_course.value,
    'byBranch', by_branch.value,
    'byPackage', by_package.value,
    'dailyAverage', case when p_days > 0 then round((totals.orders_total::numeric / p_days), 2) else 0 end,
    'strongestDayByOrders', (select value from strongest_orders),
    'strongestDayByValue', (select value from strongest_value)
  )
  from totals, by_course, by_branch, by_package;
$$;
revoke all on function public.bubu_email_order_report(date, date, integer) from public, anon, authenticated;
grant execute on function public.bubu_email_order_report(date, date, integer) to service_role;
