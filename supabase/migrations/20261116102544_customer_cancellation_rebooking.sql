alter table public.appointments add column customer_cancel_reason text
  check (customer_cancel_reason in (
    'scheduling_conflict', 'illness', 'postpone_course', 'other', 'no_longer_interested'
  ));
alter table bubu_private.appointment_history add column customer_cancel_reason text;

create or replace function bubu_private.record_appointment_history() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  -- The cancellation already records the old slot when an order is later rebooked.
  if old.status = 'cancelled' then return new; end if;
  insert into bubu_private.appointment_history
    (order_id, branch, starts_at, ends_at, kind, new_starts_at, customer_cancel_reason)
  select old.order_id, old.branch, previous.starts_at, previous.ends_at,
    case when old.slot_id <> new.slot_id then 'moved' else new.status::text end,
    case when old.slot_id <> new.slot_id then destination.starts_at end,
    case when new.status = 'cancelled' then new.customer_cancel_reason end
  from public.appointment_slots previous
  join public.appointment_slots destination on destination.id = new.slot_id
  where previous.id = old.slot_id;
  return new;
end $$;

create or replace function public.bubu_admin_appointment_history(p_date date, p_month date, p_branch text)
returns jsonb language sql stable security definer set search_path = '' as $$
  with bounds as (
    select p_date::timestamp at time zone 'Europe/Prague' as day_start,
      (p_date + 1)::timestamp at time zone 'Europe/Prague' as day_end,
      p_month::timestamp at time zone 'Europe/Prague' as month_start,
      (p_month + interval '1 month') at time zone 'Europe/Prague' as month_end
  ), monthly as (
    select (h.starts_at at time zone 'Europe/Prague')::date as date,
      count(*) filter (where h.kind = 'moved') as moved,
      count(*) filter (where h.kind = 'cancelled') as cancelled,
      count(*) filter (where h.kind = 'expired') as expired,
      count(*) filter (
        where h.kind = 'moved'
          and h.changed_at between h.starts_at - interval '24 hours' and h.starts_at
      ) as "lateMoved",
      count(*) filter (
        where h.kind = 'cancelled'
          and h.changed_at between h.starts_at - interval '24 hours' and h.starts_at
      ) as "lateCancelled"
    from bubu_private.appointment_history h cross join bounds b
    where h.starts_at >= b.month_start and h.starts_at < b.month_end
      and (p_branch is null or h.branch = p_branch)
    group by 1
  ), daily as (
    select h.id, h.kind, h.branch, h.starts_at, h.ends_at, h.changed_at, h.new_starts_at, h.customer_cancel_reason,
      h.kind in ('moved', 'cancelled')
        and h.changed_at between h.starts_at - interval '24 hours' and h.starts_at as late,
      o.public_code, o.course, o.first_name, o.last_name, o.email, o.phone
    from bubu_private.appointment_history h
    join public.orders o on o.id = h.order_id
    cross join bounds b
    where h.starts_at >= b.day_start and h.starts_at < b.day_end
      and (p_branch is null or h.branch = p_branch)
  )
  select jsonb_build_object(
    'days', coalesce((select jsonb_agg(to_jsonb(m) order by m.date) from monthly m), '[]'::jsonb),
    'entries', coalesce((select jsonb_agg(jsonb_build_object(
      'kind', d.kind, 'branch', d.branch, 'startsAt', d.starts_at, 'endsAt', d.ends_at,
      'changedAt', d.changed_at, 'newStartsAt', d.new_starts_at, 'late', d.late,
      'cancellationReason', d.customer_cancel_reason, 'publicCode', d.public_code, 'course', d.course,
      'contact', jsonb_build_object('firstName', d.first_name, 'lastName', d.last_name,
        'email', d.email, 'phone', d.phone)
    ) order by d.starts_at, d.changed_at, d.id) from daily d), '[]'::jsonb)
  );
$$;

create or replace function public.bubu_public_order(p_public_code text) returns jsonb
language sql security definer set search_path='' as $$
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
    'canRebookCancelled', o.status = 'cancelled' and exists (
      select 1 from public.appointments a where a.order_id = o.id
        and a.status = 'cancelled' and a.customer_cancel_reason <> 'no_longer_interested'
    ),
    'appointment', (
      select jsonb_build_object('id', a.id, 'branch', a.branch, 'status', a.status, 'revision', a.revision, 'startsAt', s.starts_at, 'endsAt', s.ends_at)
      from public.appointments a join public.appointment_slots s on s.id = a.slot_id
      where a.order_id = o.id and a.status not in ('expired','cancelled')
      limit 1
    ),
    'createdAt', o.created_at
  )
  from public.orders o
  where upper(o.public_code) = upper(p_public_code)
  limit 1
$$;

create or replace function bubu_private.reschedule_appointment(
  p_order_id uuid, p_slot uuid, p_expected_starts_at timestamptz
) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  o public.orders;
  app public.appointments;
  s public.appointment_slots;
  order_branch text;
  chosen integer;
  moment timestamptz;
begin
  select branch into order_branch from public.orders where id = p_order_id;
  if not found then return jsonb_build_object('ok', false); end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(order_branch, 0));
  perform bubu_private.expire_branch(order_branch);

  select * into o from public.orders where id = p_order_id for update;
  if not found or o.status in ('expired', 'enrolled') then
    return jsonb_build_object('ok', false);
  end if;
  select * into app from public.appointments where order_id = o.id for update;
  if not found or app.status in ('expired', 'attended') then
    return jsonb_build_object('ok', false);
  end if;
  if o.status = 'cancelled' or app.status = 'cancelled' then
    if o.status <> 'cancelled' or app.status <> 'cancelled'
      or app.customer_cancel_reason is null or app.customer_cancel_reason = 'no_longer_interested' then
      return jsonb_build_object('ok', false);
    end if;
  elsif app.slot_id = p_slot then
    return jsonb_build_object('ok', false);
  end if;
  if p_expected_starts_at is not null and not exists (
    select 1 from public.appointment_slots where id = app.slot_id and starts_at = p_expected_starts_at
  ) then
    return jsonb_build_object('ok', false);
  end if;

  select * into s from public.appointment_slots where id = p_slot and branch = order_branch for update;
  moment := clock_timestamp();
  if not found or s.blocked or s.starts_at <= moment then
    return jsonb_build_object('ok', false);
  end if;
  select n into chosen from generate_series(1, s.capacity) n
  where not exists (
    select 1 from public.appointments a
    where a.slot_id = s.id and a.seat = n and a.status not in ('expired', 'cancelled')
  ) order by n limit 1;
  if chosen is null then return jsonb_build_object('ok', false); end if;

  update public.appointments set slot_id = s.id, seat = chosen, status = 'rescheduled',
    revision = revision + 1, customer_cancel_reason = null, hold_expires_at = null, confirmed_at = coalesce(confirmed_at, moment)
  where id = app.id returning * into app;
  update public.orders set status = 'rescheduled', updated_at = moment where id = o.id;
  update public.notification_jobs set status = 'cancelled'
    where order_id = o.id and status in ('pending', 'processing');
  update public.email_events set status = 'skipped'
    where order_id = o.id and status = 'pending' and (
      event_type = 'appointment_no_show'
      or (event_type = 'appointment_cancelled' and metadata ? 'cancelledAppointmentRevision')
    );
  insert into public.notification_jobs(order_id, appointment_id, revision, kind, idempotency_key, due_at)
    values (o.id, app.id, app.revision, 'changed', app.id || ':' || app.revision || ':changed', moment)
    on conflict (idempotency_key) do nothing;
  insert into public.audit_log(action, target_id)
    values (case when p_expected_starts_at is null then 'appointment_rescheduled'
      else 'admin_appointment_rescheduled' end, o.id);
  return jsonb_build_object('ok', true, 'appointmentId', app.id, 'publicCode', o.public_code,
    'startsAt', s.starts_at, 'endsAt', s.ends_at, 'revision', app.revision);
end $$;

-- The revision check prevents an old browser tab from cancelling a newer booking.
create function public.bubu_customer_cancel_appointment(
  p_public_code text, p_reason text, p_expected_revision integer, p_follow_up jsonb
) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  o public.orders;
  app public.appointments;
  moment timestamptz;
begin
  if p_reason is null or p_reason not in (
    'scheduling_conflict', 'illness', 'postpone_course', 'other', 'no_longer_interested'
  ) then return jsonb_build_object('ok', false); end if;
  select * into o from public.orders where upper(public_code) = upper(p_public_code) for update;
  if not found or o.status not in ('confirmed', 'rescheduled', 'provisional') then
    return jsonb_build_object('ok', false);
  end if;
  select * into app from public.appointments where order_id = o.id for update;
  if not found or app.status not in ('confirmed', 'rescheduled', 'provisional')
    or app.revision is distinct from p_expected_revision then
    return jsonb_build_object('ok', false);
  end if;
  if p_reason <> 'no_longer_interested' and (
    p_follow_up->>'idempotencyKey' is null or p_follow_up->>'subject' is null
    or (p_follow_up->'metadata'->'cancelledAppointmentRevision') is distinct from to_jsonb(app.revision + 1)
  ) then
    return jsonb_build_object('ok', false);
  end if;
  moment := clock_timestamp();
  update public.appointments set status = 'cancelled', hold_expires_at = null,
    customer_cancel_reason = p_reason, revision = revision + 1
  where id = app.id returning * into app;
  update public.orders set status = 'cancelled', updated_at = moment where id = o.id;
  update public.notification_jobs set status = 'cancelled'
    where order_id = o.id and status in ('pending', 'processing');
  update public.email_events set status = 'skipped'
    where order_id = o.id and status = 'pending' and event_type in (
      'appointment_no_show', 'appointment_reminder_3d', 'appointment_reminder_same_day',
      'unbooked_reminder_3d', 'unbooked_reminder_7d', 'unbooked_reminder_14d', 'inactive_order_alert'
    );
  insert into public.notification_jobs(order_id, appointment_id, revision, kind, idempotency_key, due_at)
    values (o.id, app.id, app.revision, 'cancelled', app.id || ':' || app.revision || ':cancelled', moment)
    on conflict (idempotency_key) do nothing;
  insert into public.audit_log(action, target_id, metadata)
    values ('appointment_cancelled', o.id, jsonb_build_object('reason', p_reason));
  if p_reason <> 'no_longer_interested' then
    insert into public.email_events
      (idempotency_key, order_id, appointment_id, event_type, recipient, subject, scheduled_for, metadata)
    values (p_follow_up->>'idempotencyKey', o.id, app.id, 'appointment_cancelled', o.email,
      p_follow_up->>'subject', moment + interval '72 hours', p_follow_up->'metadata');
  end if;
  return jsonb_build_object(
    'ok', true, 'revision', app.revision,
    'canRebook', p_reason <> 'no_longer_interested'
  );
end $$;
revoke all on function public.bubu_customer_cancel_appointment(text, text, integer, jsonb) from public, anon, authenticated;
grant execute on function public.bubu_customer_cancel_appointment(text, text, integer, jsonb) to service_role;
