-- A confirmed enrollment is a lead conversion value, not a record of cash received.
alter table public.orders add column if not exists conversion_confirmed_at timestamptz;
alter table public.orders add column if not exists conversion_value_czk integer;
alter table public.orders add constraint orders_conversion_value_positive
  check (conversion_value_czk is null or conversion_value_czk > 0);

create or replace function public.bubu_admin_order_action(
  p_token text, p_order_id uuid, p_action text
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  target public.orders;
  admin_email text;
  moment timestamptz := clock_timestamp();
begin
  select u.email into admin_email
  from bubu_private.admin_sessions s
  join bubu_private.admin_users u on u.email = s.email
  where s.token_hash = encode(extensions.digest(coalesce(p_token, ''), 'sha256'), 'hex')
    and s.expires_at > moment and u.active;
  if admin_email is null or p_action not in ('attend', 'cancel') then
    return jsonb_build_object('ok', false);
  end if;

  select * into target from public.orders where id = p_order_id for update;
  if not found or target.status in ('cancelled', 'expired') then
    return jsonb_build_object('ok', false);
  end if;

  if p_action = 'attend' then
    if target.status not in ('confirmed', 'rescheduled', 'attended') then
      return jsonb_build_object('ok', false);
    end if;
    update public.orders set status = 'enrolled', conversion_confirmed_at = moment,
      conversion_value_czk = total_czk, updated_at = moment where id = p_order_id;
    update public.appointments set status = 'attended', hold_expires_at = null,
      revision = revision + 1
    where order_id = p_order_id and status not in ('cancelled', 'expired');
  else
    update public.orders set status = 'cancelled', conversion_confirmed_at = null,
      conversion_value_czk = null, updated_at = moment where id = p_order_id;
    update public.appointments set status = 'cancelled', hold_expires_at = null,
      revision = revision + 1
    where order_id = p_order_id and status not in ('cancelled', 'expired');
  end if;

  update public.notification_jobs set status = 'cancelled'
  where order_id = p_order_id and status in ('pending', 'processing');
  insert into public.audit_log(action, target_id, metadata)
  values ('admin_order_' || p_action, p_order_id,
    jsonb_build_object('publicCode', target.public_code, 'conversionValueCzk',
      case when p_action = 'attend' then target.total_czk else null end));
  return jsonb_build_object('ok', true, 'status',
    case when p_action = 'attend' then 'enrolled' else 'cancelled' end);
end $$;
revoke all on function public.bubu_admin_order_action(text, uuid, text) from public, anon, authenticated;
grant execute on function public.bubu_admin_order_action(text, uuid, text) to service_role;

create or replace function public.bubu_admin_appointment_days(
  p_month date, p_branch text default null
) returns jsonb language sql stable security definer set search_path = '' as $$
  select coalesce(jsonb_agg(jsonb_build_object('date', local_date, 'count', total)
    order by local_date), '[]'::jsonb)
  from (
    select (s.starts_at at time zone 'Europe/Prague')::date local_date,
      count(*)::integer total
    from public.appointments a
    join public.appointment_slots s on s.id = a.slot_id
    join public.orders o on o.id = a.order_id
    where (s.starts_at at time zone 'Europe/Prague')::date >= p_month
      and (s.starts_at at time zone 'Europe/Prague')::date < (p_month + interval '1 month')::date
      and (p_branch is null or a.branch = p_branch)
      and a.status not in ('cancelled', 'expired')
      and o.status <> 'cancelled'
    group by local_date
  ) days;
$$;
revoke all on function public.bubu_admin_appointment_days(date, text) from public, anon, authenticated;
grant execute on function public.bubu_admin_appointment_days(date, text) to service_role;

create or replace function public.bubu_admin_appointments(p_local_date date, p_branch text default null)
returns jsonb language sql security definer set search_path = '' as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'appointmentId', a.id, 'orderId', o.id, 'status', a.status,
    'branch', a.branch, 'startsAt', s.starts_at, 'endsAt', s.ends_at,
    'publicCode', o.public_code, 'course', o.course, 'package', o.package,
    'totalCzk', o.total_czk,
    'contact', jsonb_build_object('firstName', o.first_name, 'lastName', o.last_name,
      'email', o.email, 'phone', o.phone)
  ) order by s.starts_at, o.last_name), '[]'::jsonb)
  from public.appointments a
  join public.appointment_slots s on s.id = a.slot_id
  join public.orders o on o.id = a.order_id
  where (s.starts_at at time zone 'Europe/Prague')::date = p_local_date
    and (p_branch is null or a.branch = p_branch)
    and a.status not in ('cancelled', 'expired') and o.status <> 'cancelled';
$$;
revoke all on function public.bubu_admin_appointments(date, text) from public, anon, authenticated;
grant execute on function public.bubu_admin_appointments(date, text) to service_role;

create or replace function public.bubu_admin_orders(
  p_from timestamptz, p_to timestamptz, p_course text default null,
  p_branch text default null, p_status text default null, p_query text default null,
  p_limit integer default 200
) returns jsonb language sql stable security definer set search_path = '' as $$
  with filtered as (
    select o.*,
      (
        select jsonb_build_object('id', a.id, 'branch', a.branch, 'status', a.status,
          'startsAt', s.starts_at, 'endsAt', s.ends_at)
        from public.appointments a
        join public.appointment_slots s on s.id = a.slot_id
        where a.order_id = o.id order by s.starts_at desc limit 1
      ) appointment,
      coalesce((
        select jsonb_agg(jsonb_build_object('id', i.product_id, 'title', i.title,
          'quantity', i.quantity, 'unitPrice', i.unit_price_czk, 'total', i.total_czk)
          order by i.title)
        from public.order_items i where i.order_id = o.id
      ), '[]'::jsonb) addons
    from public.orders o
    where o.created_at >= p_from and o.created_at < p_to
      and (p_course is null or o.course = p_course)
      and (p_branch is null or o.branch = p_branch)
      and (p_status = 'all' or (p_status is null and o.status <> 'cancelled')
        or o.status::text = p_status)
      and (p_query is null or p_query = '' or o.public_code ilike '%' || p_query || '%'
        or o.email ilike '%' || p_query || '%' or o.first_name ilike '%' || p_query || '%'
        or o.last_name ilike '%' || p_query || '%' or o.phone ilike '%' || p_query || '%')
    order by o.created_at desc
    limit least(greatest(coalesce(p_limit, 200), 1), 500)
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'orderId', id, 'publicCode', public_code, 'createdAt', created_at,
    'status', status, 'branch', branch, 'course', course, 'package', package,
    'totalCzk', total_czk, 'conversionConfirmedAt', conversion_confirmed_at,
    'conversionValueCzk', conversion_value_czk,
    'contact', jsonb_build_object('firstName', first_name, 'lastName', last_name,
      'email', email, 'phone', phone),
    'selection', selection, 'price', price_snapshot, 'addons', addons,
    'appointment', appointment
  ) order by created_at desc), '[]'::jsonb) from filtered;
$$;
revoke all on function public.bubu_admin_orders(timestamptz, timestamptz, text, text, text, text, integer)
  from public, anon, authenticated;
grant execute on function public.bubu_admin_orders(timestamptz, timestamptz, text, text, text, text, integer)
  to service_role;

create or replace function public.bubu_admin_summary(
  p_from timestamptz, p_to timestamptz, p_course text default null
) returns jsonb language sql stable security definer set search_path = '' as $$
  with filtered_orders as (
    select * from public.orders where created_at >= p_from and created_at < p_to
      and status <> 'cancelled' and (p_course is null or course = p_course)
  ), filtered_appointments as (
    select a.*, s.starts_at from public.appointments a
    join public.appointment_slots s on s.id = a.slot_id
    join filtered_orders o on o.id = a.order_id
    where a.status not in ('cancelled', 'expired')
  )
  select jsonb_build_object(
    'ordersTotal', (select count(*) from filtered_orders),
    'ordersConfirmed', (select count(*) from filtered_orders
      where status in ('confirmed', 'enrolled', 'attended')),
    'appointmentsTotal', (select count(*) from filtered_appointments),
    'byCourse', coalesce((select jsonb_agg(jsonb_build_object('course', course,
      'count', total) order by course)
      from (select course, count(*) total from filtered_orders group by course) c), '[]'::jsonb),
    'byDay', coalesce((select jsonb_agg(jsonb_build_object('date', local_date,
      'count', total) order by local_date)
      from (select (starts_at at time zone 'Europe/Prague')::date local_date,
        count(*) total from filtered_appointments group by local_date) d), '[]'::jsonb)
  );
$$;
revoke all on function public.bubu_admin_summary(timestamptz, timestamptz, text)
  from public, anon, authenticated;
grant execute on function public.bubu_admin_summary(timestamptz, timestamptz, text)
  to service_role;
