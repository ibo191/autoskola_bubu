-- Kladno agrees the enrolment appointment individually after the order is received.
-- The order remains complete, auditable and subject to the same consent records as a booked order.
create or replace function public.bubu_create_without_appointment(
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
  oid uuid;
  code text;
begin
  if p_selection->>'branch' is distinct from 'kladno' then raise exception 'BRANCH_MISMATCH'; end if;
  if p_terms->>'accepted' is distinct from 'true' or coalesce(p_terms->>'version','')='' or coalesce(p_terms->>'wording','')='' then raise exception 'TERMS_REQUIRED'; end if;
  if p_privacy->>'accepted' is distinct from 'true' or coalesce(p_privacy->>'version','')='' or coalesce(p_privacy->>'wording','')='' then raise exception 'PRIVACY_REQUIRED'; end if;

  code = bubu_private.order_public_code();
  insert into public.orders(public_code,first_name,last_name,email,phone,branch,course,package,selection,price_snapshot,total_czk,verified_at,status)
    values(code,p_contact->>'firstName',p_contact->>'lastName',lower(p_contact->>'email'),p_contact->>'phone','kladno',
      p_selection->>'course',p_selection->>'package',p_selection,p_price,(p_price->>'amount')::integer,clock_timestamp(),'confirmed')
    returning id into oid;

  insert into public.order_items(order_id, product_id, variant_id, title, quantity, unit_price_czk)
  select oid, item.product_id, item.variant_id, item.title, item.quantity, item.unit_price_czk
  from jsonb_to_recordset(coalesce(p_items, '[]'::jsonb))
    as item(product_id text, variant_id text, title text, quantity integer, unit_price_czk integer)
  where item.quantity > 0;

  insert into public.consent_records(order_id,purpose,version,wording,accepted,source) values
    (oid,'terms',p_terms->>'version',p_terms->>'wording',true,'web'),
    (oid,'privacy',p_privacy->>'version',p_privacy->>'wording',true,'web'),
    (oid,'marketing',p_marketing->>'version',p_marketing->>'wording',(p_marketing->>'accepted')::boolean,'web');
  insert into public.verification_tokens(order_id,purpose,token_hash,expires_at)
    values(oid,'verify',p_token_hash,clock_timestamp()+interval '30 days');
  insert into public.audit_log(action,target_id,metadata)
    values('order_kladno_without_appointment',oid,jsonb_build_object('branch','kladno'));
  return jsonb_build_object('orderId',oid,'publicCode',code,'appointmentId',null,'expiresAt',null,'startsAt',null,'endsAt',null);
end $$;
revoke all on function public.bubu_create_without_appointment(jsonb,jsonb,jsonb,jsonb,jsonb,jsonb,jsonb,text) from public,anon,authenticated;
grant execute on function public.bubu_create_without_appointment(jsonb,jsonb,jsonb,jsonb,jsonb,jsonb,jsonb,text) to service_role;
