-- Change only future Statenice availability. Existing appointment rows and times stay intact.
update public.opening_hours
set opens_at = '15:45', closes_at = '18:30'
where branch = 'statenice' and weekday = 3;

-- Retire legacy slots without touching any appointment. Referenced slots remain
-- for existing bookings and history, but cannot be offered to new customers.
update public.appointment_slots
set blocked = true
where branch = 'statenice' and starts_at > clock_timestamp();

delete from public.appointment_slots s
where s.branch = 'statenice' and s.starts_at > clock_timestamp()
  and not exists (select 1 from public.appointments a where a.slot_id = s.id);

-- The new 15:45 cadence can overlap an already booked slot on the old 15:00
-- cadence. Skip that candidate instead of moving the existing appointment.
create or replace function bubu_private.ensure_slots(p_branch text, p_from date, p_to date) returns void
language plpgsql security definer set search_path = '' as $$
declare
  cfg public.booking_settings;
  day date;
  hours public.opening_hours;
  exception public.schedule_exceptions;
  slot_start timestamptz;
  slot_end timestamptz;
begin
  if p_to < p_from or p_to > p_from + 62 then raise exception 'INVALID_RANGE'; end if;
  select * into cfg from public.booking_settings where branch = p_branch;
  if not found or not cfg.enabled then return; end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_branch, 0));

  for day in select generate_series(p_from, p_to, interval '1 day')::date loop
    if exists (
      select 1 from public.schedule_exceptions
      where branch = p_branch and local_date = day and kind = 'closed'
    ) then
      continue;
    end if;

    select * into hours from public.opening_hours
    where branch = p_branch and weekday = extract(isodow from day)::smallint;
    if not found then
      continue;
    end if;

    select * into exception from public.schedule_exceptions
    where branch = p_branch and local_date = day and kind = 'override'
    order by starts_at limit 1;
    if found then
      hours.opens_at = exception.starts_at;
      hours.closes_at = exception.ends_at;
    end if;

    for slot_start in
      select generate_series(
        ((day + hours.opens_at) at time zone 'Europe/Prague'),
        ((day + hours.closes_at) at time zone 'Europe/Prague') - make_interval(mins => cfg.duration_minutes),
        make_interval(mins => cfg.duration_minutes)
      )
    loop
      slot_end = slot_start + make_interval(mins => cfg.duration_minutes);
      if exists (
        select 1 from public.schedule_exceptions
        where branch = p_branch and local_date = day and kind = 'blocked'
          and tstzrange(((day + starts_at) at time zone 'Europe/Prague'), ((day + ends_at) at time zone 'Europe/Prague'), '[)')
            && tstzrange(slot_start, slot_end, '[)')
      ) then
        continue;
      end if;

      if exists (
        select 1 from public.appointment_slots s
        where s.branch = p_branch
          and tstzrange(s.starts_at, s.ends_at, '[)') && tstzrange(slot_start, slot_end, '[)')
      ) then
        continue;
      end if;

      insert into public.appointment_slots(branch, starts_at, ends_at, capacity)
      values (p_branch, slot_start, slot_end, cfg.capacity)
      on conflict (branch, starts_at) do nothing;
    end loop;
  end loop;
end $$;

revoke all on function bubu_private.ensure_slots(text, date, date) from public, anon, authenticated;
grant execute on function bubu_private.ensure_slots(text, date, date) to service_role;
