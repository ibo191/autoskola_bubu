-- Admin email/password login, order list and appointment calendar overview.
create extension if not exists pgcrypto;

create table if not exists bubu_private.admin_users (
  email text primary key check (email = lower(email) and length(email) between 3 and 254),
  name text not null check (length(name) between 2 and 120),
  password_hash text not null check (length(password_hash) > 20),
  active boolean not null default true,
  created_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default clock_timestamp()
);

create table if not exists bubu_private.admin_sessions (
  token_hash text primary key check (token_hash ~ '^[a-f0-9]{64}$'),
  email text not null references bubu_private.admin_users(email) on delete cascade,
  created_at timestamptz not null default clock_timestamp(),
  expires_at timestamptz not null,
  last_seen_at timestamptz not null default clock_timestamp()
);

alter table bubu_private.admin_users enable row level security;
alter table bubu_private.admin_sessions enable row level security;
revoke all on bubu_private.admin_users from public, anon, authenticated;
revoke all on bubu_private.admin_sessions from public, anon, authenticated;
grant select, insert, update, delete on bubu_private.admin_users to service_role;
grant select, insert, update, delete on bubu_private.admin_sessions to service_role;

create or replace function bubu_private.clean_admin_sessions() returns void
language sql security definer set search_path='' as $$
  delete from bubu_private.admin_sessions where expires_at <= clock_timestamp();
$$;
revoke all on function bubu_private.clean_admin_sessions() from public, anon, authenticated;
grant execute on function bubu_private.clean_admin_sessions() to service_role;

create or replace function public.bubu_admin_login(p_email text, p_password text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare
  account bubu_private.admin_users;
  token text;
  token_hash text;
  expiry timestamptz := clock_timestamp() + interval '8 hours';
begin
  perform bubu_private.clean_admin_sessions();
  select * into account from bubu_private.admin_users where email = lower(trim(p_email)) and active;
  if not found or account.password_hash <> extensions.crypt(p_password, account.password_hash) then
    return jsonb_build_object('ok', false);
  end if;

  token := encode(extensions.gen_random_bytes(32), 'hex');
  token_hash := encode(extensions.digest(token, 'sha256'), 'hex');
  insert into bubu_private.admin_sessions(token_hash, email, expires_at) values(token_hash, account.email, expiry);
  return jsonb_build_object('ok', true, 'token', token, 'expiresAt', expiry, 'user', jsonb_build_object('email', account.email, 'name', account.name));
end $$;
revoke all on function public.bubu_admin_login(text, text) from public, anon, authenticated;
grant execute on function public.bubu_admin_login(text, text) to service_role;

create or replace function public.bubu_admin_session(p_token text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare
  token_hash text := encode(extensions.digest(coalesce(p_token, ''), 'sha256'), 'hex');
  account bubu_private.admin_users;
begin
  perform bubu_private.clean_admin_sessions();
  select u.* into account
  from bubu_private.admin_sessions s
  join bubu_private.admin_users u on u.email = s.email
  where s.token_hash = token_hash and s.expires_at > clock_timestamp() and u.active;
  if not found then
    return jsonb_build_object('ok', false);
  end if;
  update bubu_private.admin_sessions set last_seen_at = clock_timestamp() where admin_sessions.token_hash = token_hash;
  return jsonb_build_object('ok', true, 'user', jsonb_build_object('email', account.email, 'name', account.name));
end $$;
revoke all on function public.bubu_admin_session(text) from public, anon, authenticated;
grant execute on function public.bubu_admin_session(text) to service_role;

create or replace function public.bubu_admin_logout(p_token text) returns jsonb
language sql security definer set search_path='' as $$
  delete from bubu_private.admin_sessions where token_hash = encode(extensions.digest(coalesce(p_token, ''), 'sha256'), 'hex');
  select jsonb_build_object('ok', true);
$$;
revoke all on function public.bubu_admin_logout(text) from public, anon, authenticated;
grant execute on function public.bubu_admin_logout(text) to service_role;

create or replace function public.bubu_admin_orders(
  p_from timestamptz,
  p_to timestamptz,
  p_course text default null,
  p_branch text default null,
  p_status text default null,
  p_query text default null,
  p_limit integer default 200
) returns jsonb language sql security definer set search_path='' as $$
  with filtered as (
    select o.*,
      (
        select jsonb_build_object('id', a.id, 'branch', a.branch, 'status', a.status, 'startsAt', s.starts_at, 'endsAt', s.ends_at)
        from public.appointments a
        join public.appointment_slots s on s.id = a.slot_id
        where a.order_id = o.id
        order by s.starts_at desc
        limit 1
      ) appointment,
      coalesce((
        select jsonb_agg(jsonb_build_object('id', i.product_id, 'title', i.title, 'quantity', i.quantity, 'unitPrice', i.unit_price_czk, 'total', i.total_czk) order by i.title)
        from public.order_items i where i.order_id = o.id
      ), '[]'::jsonb) addons
    from public.orders o
    where o.created_at >= p_from
      and o.created_at < p_to
      and (p_course is null or o.course = p_course)
      and (p_branch is null or o.branch = p_branch)
      and (p_status is null or o.status::text = p_status)
      and (
        p_query is null or p_query = '' or
        o.public_code ilike '%' || p_query || '%' or
        o.email ilike '%' || p_query || '%' or
        o.first_name ilike '%' || p_query || '%' or
        o.last_name ilike '%' || p_query || '%' or
        o.phone ilike '%' || p_query || '%'
      )
    order by o.created_at desc
    limit least(greatest(coalesce(p_limit, 200), 1), 500)
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'orderId', id,
    'publicCode', public_code,
    'createdAt', created_at,
    'status', status,
    'branch', branch,
    'course', course,
    'package', package,
    'totalCzk', total_czk,
    'contact', jsonb_build_object('firstName', first_name, 'lastName', last_name, 'email', email, 'phone', phone),
    'selection', selection,
    'price', price_snapshot,
    'addons', addons,
    'appointment', appointment
  ) order by created_at desc), '[]'::jsonb)
  from filtered;
$$;
revoke all on function public.bubu_admin_orders(timestamptz, timestamptz, text, text, text, text, integer) from public, anon, authenticated;
grant execute on function public.bubu_admin_orders(timestamptz, timestamptz, text, text, text, text, integer) to service_role;

create or replace function public.bubu_admin_appointments(p_local_date date, p_branch text default null) returns jsonb
language sql security definer set search_path='' as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'appointmentId', a.id,
    'status', a.status,
    'branch', a.branch,
    'startsAt', s.starts_at,
    'endsAt', s.ends_at,
    'publicCode', o.public_code,
    'course', o.course,
    'package', o.package,
    'totalCzk', o.total_czk,
    'contact', jsonb_build_object('firstName', o.first_name, 'lastName', o.last_name, 'email', o.email, 'phone', o.phone)
  ) order by s.starts_at, o.last_name), '[]'::jsonb)
  from public.appointments a
  join public.appointment_slots s on s.id = a.slot_id
  join public.orders o on o.id = a.order_id
  where (s.starts_at at time zone 'Europe/Prague')::date = p_local_date
    and (p_branch is null or a.branch = p_branch)
    and a.status not in ('cancelled', 'expired');
$$;
revoke all on function public.bubu_admin_appointments(date, text) from public, anon, authenticated;
grant execute on function public.bubu_admin_appointments(date, text) to service_role;

create or replace function public.bubu_admin_next_appointment_day(p_from date default current_date, p_branch text default null) returns jsonb
language sql security definer set search_path='' as $$
  with days as (
    select (s.starts_at at time zone 'Europe/Prague')::date local_date, count(*)::int total
    from public.appointments a
    join public.appointment_slots s on s.id = a.slot_id
    where (s.starts_at at time zone 'Europe/Prague')::date >= p_from
      and (p_branch is null or a.branch = p_branch)
      and a.status not in ('cancelled', 'expired')
    group by local_date
    order by local_date
    limit 1
  )
  select case
    when exists(select 1 from days) then (select jsonb_build_object('date', local_date, 'count', total) from days)
    else null::jsonb
  end;
$$;
revoke all on function public.bubu_admin_next_appointment_day(date, text) from public, anon, authenticated;
grant execute on function public.bubu_admin_next_appointment_day(date, text) to service_role;

