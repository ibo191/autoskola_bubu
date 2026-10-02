-- Verify the admin session in the same database request as the dashboard.
-- Invalid sessions never receive dashboard data.
create or replace function public.bubu_admin_dashboard_authorized(
  p_token text,
  p_from timestamptz,
  p_to timestamptz,
  p_course text,
  p_order_branch text,
  p_status text,
  p_query text,
  p_limit integer,
  p_appointment_date date,
  p_appointment_branch text,
  p_month date,
  p_today date,
  p_schedule_branch text
) returns jsonb language plpgsql volatile security definer set search_path = '' as $$
declare
  session_result jsonb;
begin
  session_result := public.bubu_admin_session(p_token);
  if session_result->>'ok' is distinct from 'true' then
    return jsonb_build_object('ok', false);
  end if;
  return jsonb_build_object(
    'ok', true,
    'user', session_result->'user',
    'dashboard', public.bubu_admin_dashboard(
      p_from, p_to, p_course, p_order_branch, p_status, p_query, p_limit,
      p_appointment_date, p_appointment_branch, p_month, p_today, p_schedule_branch
    )
  );
end $$;

revoke all on function public.bubu_admin_dashboard_authorized(
  text, timestamptz, timestamptz, text, text, text, text, integer, date, text, date, date, text
) from public, anon, authenticated;
grant execute on function public.bubu_admin_dashboard_authorized(
  text, timestamptz, timestamptz, text, text, text, text, integer, date, text, date, date, text
) to service_role;
