alter table bubu_private.appointment_history add column customer_cancel_detail text
  check (customer_cancel_detail is null or (
    kind = 'cancelled' and customer_cancel_reason = 'other'
    and char_length(customer_cancel_detail) between 1 and 500
  ));

-- Keep cancellation, its reminder and the customer's explanation in one transaction.
create function public.bubu_customer_cancel_appointment_with_detail(
  p_public_code text, p_reason text, p_expected_revision integer,
  p_follow_up jsonb, p_reason_detail text
) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  target_order_id uuid;
  detail text;
  result jsonb;
begin
  if p_reason = 'other' then
    detail := regexp_replace(coalesce(p_reason_detail, ''), '^\s+|\s+$', '', 'g');
    if char_length(detail) not between 1 and 500 then
      return jsonb_build_object('ok', false);
    end if;
  end if;

  select id into target_order_id from public.orders
    where upper(public_code) = upper(p_public_code) for update;
  if not found then return jsonb_build_object('ok', false); end if;

  result := public.bubu_customer_cancel_appointment(
    p_public_code, p_reason, p_expected_revision, p_follow_up
  );
  if result->>'ok' = 'true' and detail is not null then
    update bubu_private.appointment_history set customer_cancel_detail = detail
      where id = (
        select id from bubu_private.appointment_history
        where order_id = target_order_id and kind = 'cancelled'
        order by id desc limit 1
      );
    if not found then raise exception 'CANCELLATION_HISTORY_MISSING'; end if;
  end if;
  return result;
end $$;
revoke all on function public.bubu_customer_cancel_appointment_with_detail(text, text, integer, jsonb, text)
  from public, anon, authenticated;
grant execute on function public.bubu_customer_cancel_appointment_with_detail(text, text, integer, jsonb, text)
  to service_role;

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
    select h.id, h.kind, h.branch, h.starts_at, h.ends_at, h.changed_at, h.new_starts_at, h.customer_cancel_reason, h.customer_cancel_detail,
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
      'cancellationReason', d.customer_cancel_reason, 'cancellationDetail', d.customer_cancel_detail, 'publicCode', d.public_code, 'course', d.course,
      'contact', jsonb_build_object('firstName', d.first_name, 'lastName', d.last_name,
        'email', d.email, 'phone', d.phone)
    ) order by d.starts_at, d.changed_at, d.id) from daily d), '[]'::jsonb)
  );
$$;
