-- Private school-group leads. Public clients have no direct table or RPC access.
create table if not exists public.school_groups (
  id uuid primary key default gen_random_uuid(),
  school_code text not null check (school_code = 'gymnazium_manna'),
  course_type text not null check (course_type in ('school', 'isp')),
  expected_members integer not null check (expected_members in (5, 10)),
  coordinator_id uuid,
  submission_key uuid not null unique,
  status text not null default 'invited' check (status in ('invited', 'active', 'closed')),
  source text not null default 'gymnazium-manna',
  ad_attribution jsonb,
  created_at timestamptz not null default now()
);
create table if not exists public.school_group_members (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.school_groups(id) on delete cascade,
  first_name text not null check (length(first_name) between 1 and 80),
  last_name text not null check (length(last_name) between 1 and 80),
  email text not null check (length(email) between 3 and 254),
  phone text not null check (phone ~ '^\+[1-9][0-9]{7,14}$'),
  confirmation_status text not null default 'invited' check (confirmation_status in ('invited', 'confirmed', 'declined')),
  invitation_sent_at timestamptz,
  reminder_sent_at timestamptz,
  confirmed_at timestamptz,
  existing_order_id uuid unique references public.orders(id),
  created_at timestamptz not null default now(),
  unique(group_id, email)
);
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'school_groups_coordinator_fk') then
    alter table public.school_groups add constraint school_groups_coordinator_fk
      foreign key (coordinator_id) references public.school_group_members(id) on delete set null deferrable initially deferred;
  end if;
end $$;
create index if not exists school_group_members_pending on public.school_group_members(created_at)
  where confirmation_status = 'invited';
create index if not exists school_group_members_order on public.school_group_members(existing_order_id)
  where existing_order_id is not null;
alter table public.school_groups enable row level security;
alter table public.school_group_members enable row level security;
revoke all on public.school_groups, public.school_group_members from public, anon, authenticated;
grant select, insert, update, delete on public.school_groups, public.school_group_members to service_role;

create or replace function public.bubu_create_school_group(
  p_submission_key uuid, p_course_type text, p_members jsonb, p_attribution jsonb default null
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare g public.school_groups; m jsonb; member_id uuid; result jsonb := '[]'::jsonb;
begin
  if p_course_type not in ('school','isp') or jsonb_typeof(p_members) <> 'array'
     or (p_course_type='school' and jsonb_array_length(p_members) <> 10)
     or (p_course_type='isp' and jsonb_array_length(p_members) <> 5)
  then raise exception 'INVALID_GROUP'; end if;
  select * into g from public.school_groups where submission_key = p_submission_key;
  if found then return jsonb_build_object('id',g.id,'created',false); end if;
  insert into public.school_groups(school_code,course_type,expected_members,submission_key,ad_attribution)
    values('gymnazium_manna',p_course_type,jsonb_array_length(p_members),p_submission_key,p_attribution)
    on conflict (submission_key) do nothing
    returning * into g;
  if not found then
    select * into g from public.school_groups where submission_key=p_submission_key;
    return jsonb_build_object('id',g.id,'created',false);
  end if;
  for m in select value from jsonb_array_elements(p_members) loop
    insert into public.school_group_members(group_id,first_name,last_name,email,phone)
      values(g.id,m->>'firstName',m->>'lastName',lower(m->>'email'),m->>'phone') returning id into member_id;
    result := result || jsonb_build_array(jsonb_build_object('id',member_id,'email',lower(m->>'email')));
    if jsonb_array_length(result) = 1 then
      update public.school_groups set coordinator_id=member_id where id=g.id;
    end if;
  end loop;
  return jsonb_build_object('id',g.id,'created',true,'members',result);
end; $$;
revoke all on function public.bubu_create_school_group(uuid,text,jsonb,jsonb) from public,anon,authenticated;
grant execute on function public.bubu_create_school_group(uuid,text,jsonb,jsonb) to service_role;

create or replace function public.bubu_create_school_order(
  p_slot uuid, p_contact jsonb, p_selection jsonb, p_price jsonb,
  p_terms jsonb, p_privacy jsonb, p_marketing jsonb, p_items jsonb,
  p_token_hash text, p_member_id uuid
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare member public.school_group_members; grp public.school_groups; booked jsonb;
begin
  select * into member from public.school_group_members where id=p_member_id for update;
  if not found or member.confirmation_status <> 'confirmed' or member.existing_order_id is not null
    then raise exception 'GROUP_MEMBER_NOT_AVAILABLE'; end if;
  select * into grp from public.school_groups where id=member.group_id;
  if grp.status='closed' or p_selection->>'partnerSchool' is distinct from 'gymnazium_manna'
    or p_selection->>'schoolCourseType' is distinct from grp.course_type
    or p_selection->>'branch' is distinct from 'strizkov' or p_selection->>'course' not in ('b','l17')
    or p_selection->>'package' is distinct from 'single'
    or p_selection->>'transmission' is distinct from 'manual'
    or lower(p_contact->>'email') is distinct from member.email
    or p_contact->>'firstName' is distinct from member.first_name
    or p_contact->>'lastName' is distinct from member.last_name
    or (grp.course_type='school' and (p_price->>'amount')::integer is distinct from 30500)
    or (grp.course_type='isp' and (p_price->>'amount')::integer is distinct from 25900)
    then raise exception 'GROUP_ORDER_MISMATCH'; end if;
  booked := public.bubu_create_provisional(p_slot,p_contact,p_selection,p_price,p_terms,p_privacy,p_marketing,p_items,p_token_hash);
  update public.school_group_members set existing_order_id=(booked->>'orderId')::uuid where id=member.id;
  return booked;
end; $$;
revoke all on function public.bubu_create_school_order(uuid,jsonb,jsonb,jsonb,jsonb,jsonb,jsonb,jsonb,text,uuid) from public,anon,authenticated;
grant execute on function public.bubu_create_school_order(uuid,jsonb,jsonb,jsonb,jsonb,jsonb,jsonb,jsonb,text,uuid) to service_role;

alter table public.email_events drop constraint if exists email_events_event_type_check;
alter table public.email_events add constraint email_events_event_type_check check (event_type in (
  'order_confirmation', 'internal_new_order', 'contact_form_notification',
  'exam_question_notification', 'exam_question_confirmation',
  'unbooked_reminder_3d', 'unbooked_reminder_7d', 'unbooked_reminder_14d',
  'inactive_order_alert', 'appointment_confirmation', 'appointment_rescheduled',
  'appointment_cancelled', 'appointment_reminder_3d', 'appointment_reminder_same_day',
  'appointment_day_report', 'daily_order_report', 'weekly_order_report', 'monthly_order_report',
  'enrollment_welcome', 'appointment_no_show', 'admin_order_cancelled',
  'school_group_invitation', 'school_group_reminder'
));
