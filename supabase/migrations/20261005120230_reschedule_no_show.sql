-- Let a customer choose a new appointment on their original no-show order.
create or replace function public.bubu_reschedule_appointment(p_public_code text, p_slot uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare
  o public.orders;
  app public.appointments;
  s public.appointment_slots;
  chosen integer;
  moment timestamptz := clock_timestamp();
begin
  select * into o from public.orders where upper(public_code)=upper(p_public_code) for update;
  if not found or o.status in ('cancelled', 'expired', 'enrolled') then
    return jsonb_build_object('ok',false);
  end if;
  select * into app from public.appointments where order_id=o.id for update;
  if not found or app.status in ('cancelled','expired','attended') then
    return jsonb_build_object('ok',false);
  end if;
  select * into s from public.appointment_slots where id=p_slot for update;
  if not found or s.branch<>o.branch or s.blocked or s.starts_at<=moment then
    return jsonb_build_object('ok',false);
  end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(o.branch,0));
  perform bubu_private.expire_branch(o.branch);
  select n into chosen from generate_series(1,s.capacity) n
  where not exists(select 1 from public.appointments a where a.slot_id=s.id and a.seat=n and a.id<>app.id and a.status not in ('expired','cancelled')) order by n limit 1;
  if chosen is null then return jsonb_build_object('ok',false); end if;
  update public.appointments set slot_id=s.id, seat=chosen, status='rescheduled', revision=revision+1, hold_expires_at=null, confirmed_at=coalesce(confirmed_at,moment)
  where id=app.id returning * into app;
  update public.orders set status='rescheduled', updated_at=moment where id=o.id;
  update public.notification_jobs set status='cancelled' where order_id=o.id and status in ('pending','processing');
  update public.email_events set status='skipped'
    where order_id=o.id and status='pending' and event_type='appointment_no_show';
  insert into public.notification_jobs(order_id,appointment_id,revision,kind,idempotency_key,due_at)
    values(o.id,app.id,app.revision,'changed',app.id||':'||app.revision||':changed',moment)
    on conflict (idempotency_key) do nothing;
  insert into public.audit_log(action,target_id) values('appointment_rescheduled',o.id);
  return jsonb_build_object('ok',true,'appointmentId',app.id,'startsAt',s.starts_at,'endsAt',s.ends_at);
end $$;
revoke all on function public.bubu_reschedule_appointment(text, uuid) from public,anon,authenticated;
grant execute on function public.bubu_reschedule_appointment(text, uuid) to service_role;
