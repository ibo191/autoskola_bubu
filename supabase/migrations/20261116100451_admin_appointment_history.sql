create table bubu_private.appointment_history (
  id bigint generated always as identity primary key,
  order_id uuid not null references public.orders(id),
  branch text not null,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  kind text not null check (kind in ('moved', 'cancelled', 'expired')),
  changed_at timestamptz not null default clock_timestamp(),
  new_starts_at timestamptz
);
alter table bubu_private.appointment_history enable row level security;
revoke all on bubu_private.appointment_history from public, anon, authenticated;
create index appointment_history_starts_at_idx on bubu_private.appointment_history(starts_at);
create index appointment_history_order_idx on bubu_private.appointment_history(order_id);

-- Capture every transition, including changes made by customers.
create function bubu_private.record_appointment_history() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into bubu_private.appointment_history
    (order_id, branch, starts_at, ends_at, kind, new_starts_at)
  select old.order_id, old.branch, previous.starts_at, previous.ends_at,
    case when old.slot_id <> new.slot_id then 'moved' else new.status::text end,
    case when old.slot_id <> new.slot_id then destination.starts_at end
  from public.appointment_slots previous
  join public.appointment_slots destination on destination.id = new.slot_id
  where previous.id = old.slot_id;
  return new;
end $$;
revoke all on function bubu_private.record_appointment_history() from public, anon, authenticated;

create trigger record_appointment_history
after update of slot_id, status on public.appointments
for each row when (
  old.slot_id is distinct from new.slot_id
  or (old.status is distinct from new.status and new.status in ('cancelled', 'expired'))
)
execute function bubu_private.record_appointment_history();

-- Closed appointments retain their date even if they predate the history trigger.
insert into bubu_private.appointment_history
  (order_id, branch, starts_at, ends_at, kind, changed_at)
select o.id, a.branch, s.starts_at, s.ends_at,
  case when a.status = 'cancelled' or o.status = 'cancelled' then 'cancelled' else 'expired' end,
  o.updated_at
from public.appointments a
join public.appointment_slots s on s.id = a.slot_id
join public.orders o on o.id = a.order_id
where a.status in ('cancelled', 'expired') or o.status = 'cancelled';

create function public.bubu_admin_appointment_history(p_date date, p_month date, p_branch text)
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
    select h.id, h.kind, h.branch, h.starts_at, h.ends_at, h.changed_at, h.new_starts_at,
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
      'publicCode', d.public_code, 'course', d.course,
      'contact', jsonb_build_object('firstName', d.first_name, 'lastName', d.last_name,
        'email', d.email, 'phone', d.phone)
    ) order by d.starts_at, d.changed_at, d.id) from daily d), '[]'::jsonb)
  );
$$;
revoke all on function public.bubu_admin_appointment_history(date, date, text) from public, anon, authenticated;
grant execute on function public.bubu_admin_appointment_history(date, date, text) to service_role;

-- Share allocation and notification handling between admin and customer reschedules.
-- A status-only update within the same seat does not need the branch/slot lock.
create or replace function bubu_private.check_seat() returns trigger
language plpgsql security definer set search_path = '' as $$
declare cap integer;
begin
  if tg_op = 'UPDATE' then
    if new.slot_id = old.slot_id and new.branch = old.branch and new.seat = old.seat
      and (old.status not in ('cancelled', 'expired') or new.status in ('cancelled', 'expired')) then
      return new;
    end if;
  end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(new.branch, 0));
  select capacity into cap from public.appointment_slots
    where id = new.slot_id and branch = new.branch for update;
  if cap is null or new.seat > cap then raise exception 'INVALID_SEAT'; end if;
  return new;
end $$;

create function bubu_private.reschedule_appointment(
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
  if not found or o.status in ('cancelled', 'expired', 'enrolled') then
    return jsonb_build_object('ok', false);
  end if;
  select * into app from public.appointments where order_id = o.id for update;
  if not found or app.status in ('cancelled', 'expired', 'attended') or app.slot_id = p_slot then
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
    revision = revision + 1, hold_expires_at = null, confirmed_at = coalesce(confirmed_at, moment)
  where id = app.id returning * into app;
  update public.orders set status = 'rescheduled', updated_at = moment where id = o.id;
  update public.notification_jobs set status = 'cancelled'
    where order_id = o.id and status in ('pending', 'processing');
  update public.email_events set status = 'skipped'
    where order_id = o.id and status = 'pending' and event_type = 'appointment_no_show';
  insert into public.notification_jobs(order_id, appointment_id, revision, kind, idempotency_key, due_at)
    values (o.id, app.id, app.revision, 'changed', app.id || ':' || app.revision || ':changed', moment)
    on conflict (idempotency_key) do nothing;
  insert into public.audit_log(action, target_id)
    values (case when p_expected_starts_at is null then 'appointment_rescheduled'
      else 'admin_appointment_rescheduled' end, o.id);
  return jsonb_build_object('ok', true, 'appointmentId', app.id, 'publicCode', o.public_code,
    'startsAt', s.starts_at, 'endsAt', s.ends_at, 'revision', app.revision);
end $$;
revoke all on function bubu_private.reschedule_appointment(uuid, uuid, timestamptz) from public, anon, authenticated;

create or replace function public.bubu_reschedule_appointment(p_public_code text, p_slot uuid)
returns jsonb language sql security definer set search_path = '' as $$
  select bubu_private.reschedule_appointment(
    (select id from public.orders where upper(public_code) = upper(p_public_code)), p_slot, null
  );
$$;

create function public.bubu_admin_reschedule_appointment(
  p_token text, p_order_id uuid, p_slot uuid, p_expected_starts_at timestamptz
) returns jsonb language plpgsql security definer set search_path = '' as $$
begin
  if not coalesce((public.bubu_admin_session(p_token)->>'ok')::boolean, false) then
    return jsonb_build_object('ok', false, 'reason', 'unauthorized');
  end if;
  if p_expected_starts_at is null then return jsonb_build_object('ok', false); end if;
  return bubu_private.reschedule_appointment(p_order_id, p_slot, p_expected_starts_at);
end $$;
revoke all on function public.bubu_admin_reschedule_appointment(text, uuid, uuid, timestamptz) from public, anon, authenticated;
grant execute on function public.bubu_admin_reschedule_appointment(text, uuid, uuid, timestamptz) to service_role;
