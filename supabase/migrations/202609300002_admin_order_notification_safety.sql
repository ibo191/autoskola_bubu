-- Enrollment only suppresses future reminders; cancellation suppresses pending mail for the order.
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
    update public.notification_jobs set status = 'cancelled'
    where order_id = p_order_id and status in ('pending', 'processing')
      and kind in ('reminder_24h', 'reminder_2h');
    update public.email_events set status = 'skipped'
    where order_id = p_order_id and status = 'pending'
      and event_type in ('unbooked_reminder_3d', 'unbooked_reminder_7d',
        'unbooked_reminder_14d', 'inactive_order_alert',
        'appointment_reminder_3d', 'appointment_reminder_same_day');
  else
    update public.orders set status = 'cancelled', conversion_confirmed_at = null,
      conversion_value_czk = null, updated_at = moment where id = p_order_id;
    update public.appointments set status = 'cancelled', hold_expires_at = null,
      revision = revision + 1
    where order_id = p_order_id and status not in ('cancelled', 'expired');
    update public.notification_jobs set status = 'cancelled'
    where order_id = p_order_id and status in ('pending', 'processing');
    update public.email_events set status = 'skipped'
    where order_id = p_order_id and status = 'pending';
  end if;

  insert into public.audit_log(action, target_id, metadata)
  values ('admin_order_' || p_action, p_order_id,
    jsonb_build_object('publicCode', target.public_code, 'conversionValueCzk',
      case when p_action = 'attend' then target.total_czk else null end));
  return jsonb_build_object('ok', true, 'status',
    case when p_action = 'attend' then 'enrolled' else 'cancelled' end);
end $$;
revoke all on function public.bubu_admin_order_action(text, uuid, text) from public, anon, authenticated;
grant execute on function public.bubu_admin_order_action(text, uuid, text) to service_role;
