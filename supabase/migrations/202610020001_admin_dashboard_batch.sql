-- Return the private dashboard from one PostgREST request instead of six.
-- Authorization remains in the server route; this RPC is service-role only.
create or replace function public.bubu_admin_dashboard(
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
begin
  return jsonb_build_object(
    'summary', public.bubu_admin_summary(p_from, p_to, p_course),
    'orders', public.bubu_admin_orders(
      p_from, p_to, p_course, p_order_branch, p_status, p_query, p_limit
    ),
    'appointments', public.bubu_admin_appointments(p_appointment_date, p_appointment_branch),
    'nextAppointmentDay', public.bubu_admin_next_appointment_day(p_today, p_appointment_branch),
    'appointmentDays', public.bubu_admin_appointment_days(p_month, p_appointment_branch),
    'scheduleDay', public.bubu_admin_schedule_day(p_schedule_branch, p_appointment_date)
  );
end $$;

revoke all on function public.bubu_admin_dashboard(
  timestamptz, timestamptz, text, text, text, text, integer, date, text, date, date, text
) from public, anon, authenticated;
grant execute on function public.bubu_admin_dashboard(
  timestamptz, timestamptz, text, text, text, text, integer, date, text, date, date, text
) to service_role;
