-- Order upsell, public order code and customer appointment management.

do $$
begin
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'orders' and column_name = 'public_code'
  ) then
    alter table public.orders add column public_code text;
  end if;
end $$;

create or replace function bubu_private.order_public_code() returns text
language plpgsql security definer set search_path = '' as $$
declare candidate text;
begin
  loop
    candidate := 'BUBU-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 8));
    exit when not exists (select 1 from public.orders where public_code = candidate);
  end loop;
  return candidate;
end $$;
revoke all on function bubu_private.order_public_code() from public, anon, authenticated;
grant execute on function bubu_private.order_public_code() to service_role;

update public.orders set public_code = bubu_private.order_public_code() where public_code is null;

alter table public.orders alter column public_code set not null;
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'orders_public_code_unique'
  ) then
    alter table public.orders add constraint orders_public_code_unique unique(public_code);
  end if;
end $$;

do $$
begin
  if exists (select 1 from pg_constraint where conname = 'consent_records_purpose_check') then
    alter table public.consent_records drop constraint consent_records_purpose_check;
  end if;
end $$;
alter table public.consent_records add constraint consent_records_purpose_check
  check (purpose in ('terms','privacy','marketing'));

create or replace function public.bubu_create_provisional(
  p_slot uuid,
  p_contact jsonb,
  p_selection jsonb,
  p_price jsonb,
  p_terms jsonb,
  p_privacy jsonb,
  p_marketing jsonb,
  p_items jsonb,
  p_token_hash text
) returns jsonb language plpgsql security definer set search_path='' as $$
declare
  s public.appointment_slots;
  cfg public.booking_settings;
  chosen integer;
  oid uuid;
  aid uuid;
  expiry timestamptz;
  code text;
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
  if p_privacy->>'accepted' is distinct from 'true' or coalesce(p_privacy->>'version','')='' or coalesce(p_privacy->>'wording','')='' then raise exception 'PRIVACY_REQUIRED'; end if;
  select n into chosen from generate_series(1,s.capacity) n
  where not exists(select 1 from public.appointments a where a.slot_id=s.id and a.seat=n and a.status not in ('expired','cancelled')) order by n limit 1;
  if chosen is null then raise exception 'SLOT_UNAVAILABLE'; end if;
  expiry=least(clock_timestamp()+make_interval(mins=>cfg.hold_minutes),s.starts_at);
  code=bubu_private.order_public_code();
  insert into public.orders(public_code,first_name,last_name,email,phone,branch,course,package,selection,price_snapshot,total_czk,verified_at,status)
    values(code,p_contact->>'firstName',p_contact->>'lastName',lower(p_contact->>'email'),p_contact->>'phone',s.branch,
      p_selection->>'course',p_selection->>'package',p_selection,p_price,(p_price->>'amount')::integer,clock_timestamp(),'confirmed') returning id into oid;

  insert into public.order_items(order_id, product_id, variant_id, title, quantity, unit_price_czk)
  select oid, item.product_id, item.variant_id, item.title, item.quantity, item.unit_price_czk
  from jsonb_to_recordset(coalesce(p_items, '[]'::jsonb))
    as item(product_id text, variant_id text, title text, quantity integer, unit_price_czk integer)
  where item.quantity > 0;

  insert into public.appointments(order_id,branch,slot_id,seat,status,hold_expires_at,confirmed_at)
    values(oid,s.branch,s.id,chosen,'confirmed',null,clock_timestamp()) returning id into aid;
  insert into public.consent_records(order_id,purpose,version,wording,accepted,source) values
    (oid,'terms',p_terms->>'version',p_terms->>'wording',true,'web'),
    (oid,'privacy',p_privacy->>'version',p_privacy->>'wording',true,'web'),
    (oid,'marketing',p_marketing->>'version',p_marketing->>'wording',(p_marketing->>'accepted')::boolean,'web');
  insert into public.verification_tokens(order_id,purpose,token_hash,expires_at) values(oid,'verify',p_token_hash,expiry);
  insert into public.audit_log(action,target_id) values('order_provisional',oid);
  return jsonb_build_object('orderId',oid,'publicCode',code,'appointmentId',aid,'expiresAt',expiry,'startsAt',s.starts_at,'endsAt',s.ends_at);
end $$;
revoke all on function public.bubu_create_provisional(uuid,jsonb,jsonb,jsonb,jsonb,jsonb,jsonb,jsonb,text) from public,anon,authenticated;
grant execute on function public.bubu_create_provisional(uuid,jsonb,jsonb,jsonb,jsonb,jsonb,jsonb,jsonb,text) to service_role;

create or replace function public.bubu_public_order(p_public_code text) returns jsonb
language sql security definer set search_path='' as $$
  select jsonb_build_object(
    'orderId', o.id,
    'publicCode', o.public_code,
    'status', o.status,
    'contact', jsonb_build_object('firstName', o.first_name, 'lastName', o.last_name, 'email', o.email, 'phone', o.phone),
    'selection', o.selection,
    'price', o.price_snapshot,
    'addons', coalesce((
      select jsonb_agg(jsonb_build_object('id', i.product_id, 'title', i.title, 'quantity', i.quantity, 'unitPrice', i.unit_price_czk, 'total', i.total_czk) order by i.title)
      from public.order_items i where i.order_id = o.id
    ), '[]'::jsonb),
    'appointment', (
      select jsonb_build_object('id', a.id, 'branch', a.branch, 'status', a.status, 'startsAt', s.starts_at, 'endsAt', s.ends_at)
      from public.appointments a join public.appointment_slots s on s.id = a.slot_id
      where a.order_id = o.id and a.status not in ('expired','cancelled')
      limit 1
    ),
    'createdAt', o.created_at
  )
  from public.orders o
  where upper(o.public_code) = upper(p_public_code)
  limit 1
$$;
revoke all on function public.bubu_public_order(text) from public,anon,authenticated;
grant execute on function public.bubu_public_order(text) to service_role;

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
  if not found then return jsonb_build_object('ok',false); end if;
  select * into app from public.appointments where order_id=o.id for update;
  if not found or app.status in ('cancelled','expired','attended','no_show') then return jsonb_build_object('ok',false); end if;
  select * into s from public.appointment_slots where id=p_slot for update;
  if not found or s.branch<>o.branch or s.blocked or s.starts_at<=moment then return jsonb_build_object('ok',false); end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(o.branch,0));
  perform bubu_private.expire_branch(o.branch);
  select n into chosen from generate_series(1,s.capacity) n
  where not exists(select 1 from public.appointments a where a.slot_id=s.id and a.seat=n and a.id<>app.id and a.status not in ('expired','cancelled')) order by n limit 1;
  if chosen is null then return jsonb_build_object('ok',false); end if;
  update public.appointments set slot_id=s.id, seat=chosen, status='rescheduled', revision=revision+1, hold_expires_at=null, confirmed_at=coalesce(confirmed_at,moment)
  where id=app.id returning * into app;
  update public.orders set status='rescheduled', updated_at=moment where id=o.id;
  update public.notification_jobs set status='cancelled' where order_id=o.id and status in ('pending','processing');
  insert into public.notification_jobs(order_id,appointment_id,revision,kind,idempotency_key,due_at)
    values(o.id,app.id,app.revision,'changed',app.id||':'||app.revision||':changed',moment)
    on conflict (idempotency_key) do nothing;
  insert into public.audit_log(action,target_id) values('appointment_rescheduled',o.id);
  return jsonb_build_object('ok',true,'appointmentId',app.id,'startsAt',s.starts_at,'endsAt',s.ends_at);
end $$;
revoke all on function public.bubu_reschedule_appointment(text, uuid) from public,anon,authenticated;
grant execute on function public.bubu_reschedule_appointment(text, uuid) to service_role;

create or replace function public.bubu_cancel_appointment(p_public_code text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare o public.orders; app public.appointments; moment timestamptz := clock_timestamp();
begin
  select * into o from public.orders where upper(public_code)=upper(p_public_code) for update;
  if not found then return jsonb_build_object('ok',false); end if;
  select * into app from public.appointments where order_id=o.id for update;
  if not found or app.status in ('cancelled','expired','attended','no_show') then return jsonb_build_object('ok',false); end if;
  update public.appointments set status='cancelled', hold_expires_at=null, revision=revision+1 where id=app.id returning * into app;
  update public.orders set status='cancelled', updated_at=moment where id=o.id;
  update public.notification_jobs set status='cancelled' where order_id=o.id and status in ('pending','processing');
  insert into public.notification_jobs(order_id,appointment_id,revision,kind,idempotency_key,due_at)
    values(o.id,app.id,app.revision,'cancelled',app.id||':'||app.revision||':cancelled',moment)
    on conflict (idempotency_key) do nothing;
  insert into public.audit_log(action,target_id) values('appointment_cancelled',o.id);
  return jsonb_build_object('ok',true);
end $$;
revoke all on function public.bubu_cancel_appointment(text) from public,anon,authenticated;
grant execute on function public.bubu_cancel_appointment(text) to service_role;
