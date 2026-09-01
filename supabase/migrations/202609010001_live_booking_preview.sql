-- Live preview booking setup. Public clients never receive direct table access.
update public.booking_settings
set duration_minutes = 20, capacity = 1, hold_minutes = 30, fixture_only = false, enabled = true
where branch in ('strizkov', 'statenice');

insert into public.booking_settings(branch, duration_minutes, capacity, hold_minutes, fixture_only, enabled)
values
  ('strizkov', 20, 1, 30, false, true),
  ('kladno', 20, 1, 30, false, false),
  ('statenice', 20, 1, 30, false, true)
on conflict (branch) do update set
  duration_minutes = excluded.duration_minutes,
  capacity = excluded.capacity,
  hold_minutes = excluded.hold_minutes,
  fixture_only = excluded.fixture_only,
  enabled = excluded.enabled;

insert into public.opening_hours(branch, weekday, opens_at, closes_at)
values
  ('strizkov', 1, '15:00', '18:00'),
  ('strizkov', 4, '15:00', '18:00'),
  ('statenice', 3, '15:00', '18:00')
on conflict (branch, weekday) do update set
  opens_at = excluded.opens_at,
  closes_at = excluded.closes_at;

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

      insert into public.appointment_slots(branch, starts_at, ends_at, capacity)
      values (p_branch, slot_start, slot_end, cfg.capacity)
      on conflict (branch, starts_at) do nothing;
    end loop;
  end loop;
end $$;

revoke all on function bubu_private.ensure_slots(text, date, date) from public, anon, authenticated;
grant execute on function bubu_private.ensure_slots(text, date, date) to service_role;

create or replace function public.bubu_available_slots(p_branch text, p_from date, p_to date)
returns table(id uuid, branch text, starts_at timestamptz, ends_at timestamptz, remaining integer)
language plpgsql security definer set search_path = '' as $$
begin
  perform bubu_private.ensure_slots(p_branch, p_from, p_to);
  perform bubu_private.expire_branch(p_branch);

  return query
  select
    s.id,
    s.branch,
    s.starts_at,
    s.ends_at,
    greatest(
      0,
      s.capacity - count(a.id) filter (where a.status not in ('cancelled', 'expired'))::integer
    ) as remaining
  from public.appointment_slots s
  left join public.appointments a on a.slot_id = s.id
  where s.branch = p_branch
    and not s.blocked
    and s.starts_at > clock_timestamp()
    and s.starts_at::date between p_from and p_to
  group by s.id, s.branch, s.starts_at, s.ends_at, s.capacity
  having greatest(
    0,
    s.capacity - count(a.id) filter (where a.status not in ('cancelled', 'expired'))::integer
  ) > 0
  order by s.starts_at
  limit 500;
end $$;

revoke all on function public.bubu_available_slots(text, date, date) from public, anon, authenticated;
grant execute on function public.bubu_available_slots(text, date, date) to service_role;

create or replace function public.bubu_admin_summary(p_from timestamptz, p_to timestamptz, p_course text default null)
returns jsonb language sql security definer set search_path = '' as $$
  with filtered_orders as (
    select * from public.orders
    where created_at >= p_from
      and created_at < p_to
      and (p_course is null or course = p_course)
  ),
  filtered_appointments as (
    select a.*, s.starts_at
    from public.appointments a
    join public.appointment_slots s on s.id = a.slot_id
    join filtered_orders o on o.id = a.order_id
    where a.status not in ('cancelled', 'expired')
  )
  select jsonb_build_object(
    'ordersTotal', (select count(*) from filtered_orders),
    'ordersConfirmed', (select count(*) from filtered_orders where status in ('confirmed', 'enrolled', 'attended')),
    'appointmentsTotal', (select count(*) from filtered_appointments),
    'byCourse', coalesce((
      select jsonb_agg(jsonb_build_object('course', course, 'count', total) order by course)
      from (select course, count(*) total from filtered_orders group by course) c
    ), '[]'::jsonb),
    'byDay', coalesce((
      select jsonb_agg(jsonb_build_object('date', local_date, 'count', total) order by local_date)
      from (
        select (starts_at at time zone 'Europe/Prague')::date local_date, count(*) total
        from filtered_appointments group by local_date
      ) d
    ), '[]'::jsonb)
  )
$$;

revoke all on function public.bubu_admin_summary(timestamptz, timestamptz, text) from public, anon, authenticated;
grant execute on function public.bubu_admin_summary(timestamptz, timestamptz, text) to service_role;

create or replace function public.bubu_rate_limit_consume(
  p_scope text,
  p_key text,
  p_limit integer,
  p_window_seconds integer
) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  bucket_id text;
  existing bubu_private.rate_limit_buckets;
  now_at timestamptz := clock_timestamp();
  window_start_at timestamptz;
  retry integer;
begin
  if p_limit < 1 or p_window_seconds < 1 or p_window_seconds > 86400 then
    raise exception 'INVALID_RATE_LIMIT';
  end if;
  if p_key !~ '^[a-f0-9]{64}$' then
    raise exception 'INVALID_RATE_KEY';
  end if;

  bucket_id := p_scope || ':' || p_key;
  window_start_at := to_timestamp(floor(extract(epoch from now_at) / p_window_seconds) * p_window_seconds);

  select * into existing from bubu_private.rate_limit_buckets where bucket_hash = bucket_id for update;
  if not found or existing.expires_at <= now_at then
    insert into bubu_private.rate_limit_buckets(bucket_hash, window_start, expires_at, requests)
    values(bucket_id, window_start_at, window_start_at + make_interval(secs => p_window_seconds), 1)
    on conflict (bucket_hash) do update set
      window_start = excluded.window_start,
      expires_at = excluded.expires_at,
      requests = 1;
    return jsonb_build_object('allowed', true, 'retryAfterSeconds', 0);
  end if;

  update bubu_private.rate_limit_buckets
  set requests = requests + 1
  where bucket_hash = bucket_id
  returning * into existing;

  if existing.requests <= p_limit then
    return jsonb_build_object('allowed', true, 'retryAfterSeconds', 0);
  end if;

  retry := greatest(1, ceil(extract(epoch from existing.expires_at - now_at))::integer);
  return jsonb_build_object('allowed', false, 'retryAfterSeconds', retry);
end $$;

revoke all on function public.bubu_rate_limit_consume(text, text, integer, integer) from public, anon, authenticated;
grant execute on function public.bubu_rate_limit_consume(text, text, integer, integer) to service_role;
