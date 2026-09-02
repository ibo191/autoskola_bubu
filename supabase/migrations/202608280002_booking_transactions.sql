-- Reservation procedures are server-only. They are not wired to the public wizard yet.
-- A per-branch advisory lock gives one lock order for hold, expiry and verification.
create or replace function bubu_private.expire_branch(p_branch text) returns void
language plpgsql security definer set search_path='' as $$
begin
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_branch,0));
  with expired as (
    update public.appointments set status='expired'
    where branch=p_branch and status='provisional' and hold_expires_at<=clock_timestamp()
    returning order_id
  ) update public.orders set status='expired',updated_at=clock_timestamp() where id in (select order_id from expired);
  update public.notification_jobs set status='cancelled' where status in ('pending','processing')
    and order_id in (select id from public.orders where branch=p_branch and status='expired');
end $$;
revoke all on function bubu_private.expire_branch(text) from public,anon,authenticated;
grant execute on function bubu_private.expire_branch(text) to service_role;

create or replace function bubu_private.check_slot_write() returns trigger
language plpgsql security definer set search_path='' as $$
begin
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(new.branch,0));
  if exists(select 1 from public.appointment_slots s where s.branch=new.branch and s.id<>new.id
    and tstzrange(s.starts_at,s.ends_at,'[)') && tstzrange(new.starts_at,new.ends_at,'[)')) then
    raise exception 'OVERLAPPING_SLOT';
  end if;
  if tg_op='UPDATE' and exists(select 1 from public.appointments where slot_id=new.id and status not in ('cancelled','expired')) then
    if new.starts_at<>old.starts_at or new.ends_at<>old.ends_at or new.branch<>old.branch
      or new.capacity<(select max(seat) from public.appointments where slot_id=new.id and status not in ('cancelled','expired')) then
      raise exception 'OCCUPIED_SLOT_CHANGE';
    end if;
  end if;
  return new;
end $$;
drop trigger if exists validate_slot_write on public.appointment_slots;
create trigger validate_slot_write before insert or update on public.appointment_slots
for each row execute function bubu_private.check_slot_write();
revoke all on function bubu_private.check_slot_write() from public,anon,authenticated;

create or replace function bubu_private.check_seat() returns trigger
language plpgsql security definer set search_path='' as $$
declare cap integer;
begin
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(new.branch,0));
  select capacity into cap from public.appointment_slots where id=new.slot_id and branch=new.branch for update;
  if cap is null or new.seat>cap then raise exception 'INVALID_SEAT'; end if;
  return new;
end $$;
drop trigger if exists validate_seat on public.appointments;
create trigger validate_seat before insert or update on public.appointments
for each row execute function bubu_private.check_seat();
revoke all on function bubu_private.check_seat() from public,anon,authenticated;

create or replace function public.bubu_create_provisional(
  p_slot uuid,p_contact jsonb,p_selection jsonb,p_price jsonb,p_terms jsonb,p_marketing jsonb,p_token_hash text
) returns jsonb language plpgsql security definer set search_path='' as $$
declare s public.appointment_slots; cfg public.booking_settings; chosen integer; oid uuid; aid uuid; expiry timestamptz;
begin
  select * into s from public.appointment_slots where id=p_slot;
  if not found then raise exception 'SLOT_UNAVAILABLE'; end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(s.branch,0));
  perform bubu_private.expire_branch(s.branch);
  select * into s from public.appointment_slots where id=p_slot for update;
  select * into cfg from public.booking_settings where branch=s.branch;
  if not cfg.enabled or s.blocked or s.starts_at<=clock_timestamp() then raise exception 'SLOT_UNAVAILABLE'; end if;
  if p_selection->>'branch' is distinct from s.branch then raise exception 'BRANCH_MISMATCH'; end if;
  if p_terms->>'accepted' is distinct from 'true' or coalesce(p_terms->>'version','')='' or coalesce(p_terms->>'wording','')='' then raise exception 'TERMS_REQUIRED'; end if;
  select n into chosen from generate_series(1,s.capacity) n
  where not exists(select 1 from public.appointments a where a.slot_id=s.id and a.seat=n and a.status not in ('expired','cancelled')) order by n limit 1;
  if chosen is null then raise exception 'SLOT_UNAVAILABLE'; end if;
  expiry=least(clock_timestamp()+make_interval(mins=>cfg.hold_minutes),s.starts_at);
  insert into public.orders(first_name,last_name,email,phone,branch,course,package,selection,price_snapshot,total_czk)
    values(p_contact->>'firstName',p_contact->>'lastName',lower(p_contact->>'email'),p_contact->>'phone',s.branch,
      p_selection->>'course',p_selection->>'package',p_selection,p_price,(p_price->>'amount')::integer) returning id into oid;
  insert into public.appointments(order_id,branch,slot_id,seat,hold_expires_at)
    values(oid,s.branch,s.id,chosen,expiry) returning id into aid;
  insert into public.consent_records(order_id,purpose,version,wording,accepted,source) values
    (oid,'terms',p_terms->>'version',p_terms->>'wording',true,'local-test'),
    (oid,'marketing',p_marketing->>'version',p_marketing->>'wording',(p_marketing->>'accepted')::boolean,'local-test');
  insert into public.verification_tokens(order_id,purpose,token_hash,expires_at) values(oid,'verify',p_token_hash,expiry);
  insert into public.audit_log(action,target_id) values('order_provisional',oid);
  return jsonb_build_object('orderId',oid,'appointmentId',aid,'expiresAt',expiry);
end $$;
revoke all on function public.bubu_create_provisional(uuid,jsonb,jsonb,jsonb,jsonb,jsonb,text) from public,anon,authenticated;
grant execute on function public.bubu_create_provisional(uuid,jsonb,jsonb,jsonb,jsonb,jsonb,text) to service_role;

create or replace function public.bubu_verify_email(p_hash text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare tok public.verification_tokens; app public.appointments; slot public.appointment_slots; branch_id text; moment timestamptz;
begin
  select o.branch into branch_id from public.verification_tokens t join public.orders o on o.id=t.order_id where t.token_hash=p_hash and t.purpose='verify';
  if branch_id is null then return jsonb_build_object('ok',false); end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(branch_id,0));
  perform bubu_private.expire_branch(branch_id);
  moment=clock_timestamp();
  select * into tok from public.verification_tokens where token_hash=p_hash and purpose='verify' for update;
  if tok.used_at is not null or tok.expires_at<=moment or tok.attempts>=10 then return jsonb_build_object('ok',false); end if;
  select * into app from public.appointments where order_id=tok.order_id for update;
  if app.status<>'provisional' or app.hold_expires_at<=moment then return jsonb_build_object('ok',false); end if;
  select * into slot from public.appointment_slots where id=app.slot_id;
  if slot.blocked or slot.starts_at<=moment then return jsonb_build_object('ok',false); end if;
  update public.verification_tokens set used_at=moment,attempts=attempts+1 where id=tok.id;
  update public.orders set verified_at=moment,status='confirmed',updated_at=moment where id=tok.order_id;
  update public.appointments set status='confirmed',confirmed_at=moment,hold_expires_at=null where id=app.id;
  insert into public.notification_jobs(order_id,appointment_id,revision,kind,idempotency_key,due_at)
    values(tok.order_id,app.id,app.revision,'confirmation',app.id||':'||app.revision||':confirmation',moment);
  if slot.starts_at-interval '24 hours'>moment then
    insert into public.notification_jobs(order_id,appointment_id,revision,kind,idempotency_key,due_at)
      values(tok.order_id,app.id,app.revision,'reminder_24h',app.id||':'||app.revision||':24h',slot.starts_at-interval '24 hours');
  end if;
  if slot.starts_at-interval '2 hours'>moment then
    insert into public.notification_jobs(order_id,appointment_id,revision,kind,idempotency_key,due_at)
      values(tok.order_id,app.id,app.revision,'reminder_2h',app.id||':'||app.revision||':2h',slot.starts_at-interval '2 hours');
  end if;
  insert into public.audit_log(action,target_id) values('email_verified',tok.order_id);
  return jsonb_build_object('ok',true,'orderId',tok.order_id);
end $$;
revoke all on function public.bubu_verify_email(text) from public,anon,authenticated;
grant execute on function public.bubu_verify_email(text) to service_role;
