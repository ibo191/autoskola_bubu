-- Admin controls for enrollment days and individual slots. Existing bookings stay intact.
create table bubu_private.admin_schedule_blocks (
  id uuid primary key default gen_random_uuid(),
  branch text not null references public.booking_settings(branch),
  local_date date not null,
  kind text not null check (kind in ('day', 'slot')),
  slot_id uuid references public.appointment_slots(id),
  exception_id uuid not null references public.schedule_exceptions(id),
  was_blocked boolean,
  previously_open_slot_ids uuid[],
  reason text,
  created_by text not null,
  created_at timestamptz not null default now(),
  check ((kind = 'day' and slot_id is null) or (kind = 'slot' and slot_id is not null))
);
create unique index admin_schedule_day_unique on bubu_private.admin_schedule_blocks(branch, local_date)
  where kind = 'day';
create unique index admin_schedule_slot_unique on bubu_private.admin_schedule_blocks(slot_id)
  where kind = 'slot';
alter table bubu_private.admin_schedule_blocks enable row level security;
revoke all on bubu_private.admin_schedule_blocks from public, anon, authenticated;
grant all on bubu_private.admin_schedule_blocks to service_role;

create or replace function public.bubu_admin_schedule_day(p_branch text, p_local_date date)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare result jsonb;
begin
  if p_branch not in ('strizkov', 'statenice') then
    return jsonb_build_object('closed', false, 'slots', '[]'::jsonb);
  end if;
  -- Generate regular slots before displaying the day. The generator itself respects exceptions.
  perform bubu_private.ensure_slots(p_branch, p_local_date, p_local_date);
  select jsonb_build_object(
    'closed', exists(select 1 from public.schedule_exceptions e
      where e.branch = p_branch and e.local_date = p_local_date and e.kind = 'closed'),
    'managedClosure', exists(select 1 from bubu_private.admin_schedule_blocks b
      where b.branch = p_branch and b.local_date = p_local_date and b.kind = 'day'),
    'slots', coalesce((select jsonb_agg(jsonb_build_object(
      'id', s.id, 'startsAt', s.starts_at, 'endsAt', s.ends_at,
      'capacity', s.capacity, 'booked', (select count(*) from public.appointments a
        where a.slot_id = s.id and a.status not in ('cancelled', 'expired')),
      'blocked', s.blocked, 'managedBlock', exists(select 1 from bubu_private.admin_schedule_blocks b
        where b.slot_id = s.id and b.kind = 'slot')
    ) order by s.starts_at) from public.appointment_slots s
      where s.branch = p_branch and (s.starts_at at time zone 'Europe/Prague')::date = p_local_date), '[]'::jsonb)
  ) into result;
  return result;
end $$;
revoke all on function public.bubu_admin_schedule_day(text, date) from public, anon, authenticated;
grant execute on function public.bubu_admin_schedule_day(text, date) to service_role;

create or replace function public.bubu_admin_schedule_action(
  p_token text, p_branch text, p_local_date date, p_action text,
  p_start time default null, p_slot_id uuid default null, p_reason text default null
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  admin_email text;
  moment timestamptz := clock_timestamp();
  slot public.appointment_slots;
  cfg public.booking_settings;
  block bubu_private.admin_schedule_blocks;
  new_exception uuid;
  start_utc timestamptz;
  end_utc timestamptz;
  booked_count integer;
begin
  select u.email into admin_email from bubu_private.admin_sessions s
  join bubu_private.admin_users u on u.email = s.email
  where s.token_hash = encode(extensions.digest(coalesce(p_token, ''), 'sha256'), 'hex')
    and s.expires_at > moment and u.active;
  if admin_email is null then return jsonb_build_object('ok', false, 'code', 'UNAUTHORIZED'); end if;
  if p_branch not in ('strizkov', 'statenice') or p_local_date is null
    or p_local_date < (moment at time zone 'Europe/Prague')::date
    or p_action not in ('close_day', 'open_day', 'add_slot', 'remove_slot', 'restore_slot') then
    return jsonb_build_object('ok', false, 'code', 'INVALID_REQUEST');
  end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_branch, 0));
  select * into cfg from public.booking_settings where branch = p_branch and enabled;
  if not found then return jsonb_build_object('ok', false, 'code', 'BRANCH_UNAVAILABLE'); end if;

  if p_action = 'close_day' then
    if exists(select 1 from public.schedule_exceptions where branch = p_branch
      and local_date = p_local_date and kind = 'closed') then
      return jsonb_build_object('ok', false, 'code', 'ALREADY_CLOSED');
    end if;
    insert into public.schedule_exceptions(branch, local_date, kind)
      values (p_branch, p_local_date, 'closed') returning id into new_exception;
    insert into bubu_private.admin_schedule_blocks
      (branch, local_date, kind, exception_id, previously_open_slot_ids, reason, created_by)
      values (p_branch, p_local_date, 'day', new_exception,
        array(select s.id from public.appointment_slots s where s.branch = p_branch
          and (s.starts_at at time zone 'Europe/Prague')::date = p_local_date and not s.blocked),
        left(p_reason, 200), admin_email);
    update public.appointment_slots s set blocked = true where s.branch = p_branch
      and (s.starts_at at time zone 'Europe/Prague')::date = p_local_date and not s.blocked;
    select count(*) into booked_count from public.appointments a
      join public.appointment_slots s on s.id = a.slot_id
      where s.branch = p_branch and (s.starts_at at time zone 'Europe/Prague')::date = p_local_date
        and a.status not in ('cancelled', 'expired');
    return jsonb_build_object('ok', true, 'booked', booked_count);
  end if;

  if p_action = 'open_day' then
    select * into block from bubu_private.admin_schedule_blocks
      where branch = p_branch and local_date = p_local_date and kind = 'day' for update;
    if not found then return jsonb_build_object('ok', false, 'code', 'NOT_MANAGED'); end if;
    delete from bubu_private.admin_schedule_blocks where id = block.id;
    delete from public.schedule_exceptions where id = block.exception_id;
    -- Leave individually removed slots and legacy blocked slots closed.
    update public.appointment_slots s set blocked = false
      where s.id = any(block.previously_open_slot_ids) and s.blocked
        and not exists (select 1 from bubu_private.admin_schedule_blocks b
          where b.slot_id = s.id and b.kind = 'slot')
        and not exists (select 1 from public.schedule_exceptions e where e.branch = p_branch
          and e.local_date = p_local_date and e.kind = 'blocked'
          and tstzrange(((p_local_date + e.starts_at) at time zone 'Europe/Prague'),
            ((p_local_date + e.ends_at) at time zone 'Europe/Prague'), '[)')
            && tstzrange(s.starts_at, s.ends_at, '[)'));
    return jsonb_build_object('ok', true);
  end if;

  if exists(select 1 from public.schedule_exceptions where branch = p_branch
    and local_date = p_local_date and kind = 'closed') then
    return jsonb_build_object('ok', false, 'code', 'DAY_CLOSED');
  end if;

  if p_action = 'add_slot' then
    if p_start is null then return jsonb_build_object('ok', false, 'code', 'INVALID_TIME'); end if;
    if p_branch = 'statenice' and (extract(isodow from p_local_date) <> 3 or p_start <> time '15:45') then
      return jsonb_build_object('ok', false, 'code', 'STATENICE_FIXED_TIME');
    end if;
    start_utc := (p_local_date + p_start) at time zone 'Europe/Prague';
    end_utc := start_utc + make_interval(mins => cfg.duration_minutes);
    if start_utc <= moment or (end_utc at time zone 'Europe/Prague')::date <> p_local_date then
      return jsonb_build_object('ok', false, 'code', 'INVALID_TIME');
    end if;
    if exists(select 1 from public.schedule_exceptions e where e.branch = p_branch
      and e.local_date = p_local_date and e.kind = 'blocked'
      and tstzrange(((p_local_date + e.starts_at) at time zone 'Europe/Prague'),
        ((p_local_date + e.ends_at) at time zone 'Europe/Prague'), '[)')
        && tstzrange(start_utc, end_utc, '[)')
      and not exists(select 1 from bubu_private.admin_schedule_blocks b
        where b.exception_id = e.id and b.kind = 'slot')) then
      return jsonb_build_object('ok', false, 'code', 'OTHER_BLOCK');
    end if;
    select * into slot from public.appointment_slots s where s.branch = p_branch
      and tstzrange(s.starts_at, s.ends_at, '[)') && tstzrange(start_utc, end_utc, '[)') for update;
    if found then
      if slot.starts_at <> start_utc or slot.ends_at <> end_utc then
        return jsonb_build_object('ok', false, 'code', 'OVERLAP');
      end if;
      select * into block from bubu_private.admin_schedule_blocks where slot_id = slot.id and kind = 'slot';
      if found then
        delete from bubu_private.admin_schedule_blocks where id = block.id;
        delete from public.schedule_exceptions where id = block.exception_id;
        update public.appointment_slots set blocked = block.was_blocked where id = slot.id;
      elsif slot.blocked then
        return jsonb_build_object('ok', false, 'code', 'OTHER_BLOCK');
      else
        return jsonb_build_object('ok', false, 'code', 'ALREADY_EXISTS');
      end if;
    else
      insert into public.appointment_slots(branch, starts_at, ends_at, capacity)
        values (p_branch, start_utc, end_utc, cfg.capacity) returning * into slot;
    end if;
    return jsonb_build_object('ok', true, 'slotId', slot.id);
  end if;

  select * into slot from public.appointment_slots
    where id = p_slot_id and branch = p_branch
      and (starts_at at time zone 'Europe/Prague')::date = p_local_date for update;
  if not found or slot.starts_at <= moment then
    return jsonb_build_object('ok', false, 'code', 'SLOT_NOT_FOUND');
  end if;
  if p_action = 'remove_slot' then
    if slot.blocked then return jsonb_build_object('ok', false, 'code', 'ALREADY_BLOCKED'); end if;
    insert into public.schedule_exceptions(branch, local_date, kind, starts_at, ends_at)
      values (p_branch, p_local_date, 'blocked',
        (slot.starts_at at time zone 'Europe/Prague')::time,
        (slot.ends_at at time zone 'Europe/Prague')::time) returning id into new_exception;
    insert into bubu_private.admin_schedule_blocks
      (branch, local_date, kind, slot_id, exception_id, was_blocked, created_by)
      values (p_branch, p_local_date, 'slot', slot.id, new_exception, false, admin_email);
    update public.appointment_slots set blocked = true where id = slot.id;
    select count(*) into booked_count from public.appointments
      where slot_id = slot.id and status not in ('cancelled', 'expired');
    return jsonb_build_object('ok', true, 'booked', booked_count);
  end if;
  select * into block from bubu_private.admin_schedule_blocks
    where slot_id = slot.id and kind = 'slot' for update;
  if not found then return jsonb_build_object('ok', false, 'code', 'NOT_MANAGED'); end if;
  delete from bubu_private.admin_schedule_blocks where id = block.id;
  delete from public.schedule_exceptions where id = block.exception_id;
  update public.appointment_slots set blocked = block.was_blocked where id = slot.id;
  return jsonb_build_object('ok', true);
end $$;
revoke all on function public.bubu_admin_schedule_action(text, text, date, text, time, uuid, text)
  from public, anon, authenticated;
grant execute on function public.bubu_admin_schedule_action(text, text, date, text, time, uuid, text)
  to service_role;
