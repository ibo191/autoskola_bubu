-- NOT YET EXECUTED: requires local Supabase/Docker acceptance tests.
-- Integer amounts are CZK. No fractional catalog amounts are currently supported.
create schema if not exists bubu_private;
revoke all on schema bubu_private from public, anon, authenticated;
grant usage on schema bubu_private to authenticated, service_role;

do $$
begin
  create type public.bubu_order_status as enum
    ('provisional','confirmed','rescheduled','cancelled','attended','no_show','enrolled','expired');
exception
  when duplicate_object then null;
end
$$;

create table if not exists public.staff_members (
  user_id uuid primary key references auth.users(id) on delete cascade,
  role text not null check (role in ('owner','operations')),
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create or replace function bubu_private.staff_role() returns text
language sql stable security definer set search_path = '' as $$
  select role from public.staff_members
  where user_id = auth.uid() and active and auth.jwt()->>'aal' = 'aal2'
$$;
revoke all on function bubu_private.staff_role() from public, anon;
grant execute on function bubu_private.staff_role() to authenticated, service_role;

create table if not exists public.booking_settings (
  branch text primary key check (branch in ('strizkov','kladno','statenice')),
  duration_minutes integer not null check (duration_minutes > 0),
  capacity integer not null check (capacity > 0),
  hold_minutes integer not null check (hold_minutes between 1 and 120),
  fixture_only boolean not null default true,
  enabled boolean not null default false
);
create table if not exists public.opening_hours (
  id uuid primary key default gen_random_uuid(),
  branch text not null references public.booking_settings(branch),
  weekday smallint not null check (weekday between 1 and 7),
  opens_at time not null, closes_at time not null,
  check (closes_at > opens_at), unique(branch,weekday)
);
create table if not exists public.schedule_exceptions (
  id uuid primary key default gen_random_uuid(),
  branch text not null references public.booking_settings(branch),
  local_date date not null,
  kind text not null check (kind in ('closed','override','blocked')),
  starts_at time, ends_at time,
  check ((kind='closed' and starts_at is null and ends_at is null)
    or (kind<>'closed' and starts_at is not null and ends_at > starts_at))
);
create table if not exists public.appointment_slots (
  id uuid primary key default gen_random_uuid(),
  branch text not null references public.booking_settings(branch),
  starts_at timestamptz not null, ends_at timestamptz not null,
  capacity integer not null check (capacity > 0),
  blocked boolean not null default false,
  check (ends_at > starts_at), unique(branch,starts_at), unique(id,branch)
);
create table if not exists public.orders (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  first_name text not null check (length(first_name) between 1 and 80),
  last_name text not null check (length(last_name) between 1 and 80),
  email text not null check (length(email) between 3 and 254),
  phone text not null check (phone ~ '^\+[1-9][0-9]{7,14}$'),
  branch text not null references public.booking_settings(branch),
  course text not null check (course in ('b','b-automat','l17','am','a1','a2','a','b96','be')),
  package text not null check (package in ('single','moto-basic','moto-confidence','supplement')),
  selection jsonb not null check (jsonb_typeof(selection)='object'),
  price_snapshot jsonb not null check (jsonb_typeof(price_snapshot)='object'),
  total_czk integer not null check (total_czk > 0),
  currency text not null default 'CZK' check (currency='CZK'),
  verified_at timestamptz,
  status public.bubu_order_status not null default 'provisional',
  unique(id,branch),
  check (branch='strizkov' or course in ('b','l17'))
);
create table if not exists public.order_items (
  id uuid primary key default gen_random_uuid(),order_id uuid not null references public.orders(id),
  product_id text not null, variant_id text not null, title text not null,
  quantity integer not null check (quantity between 1 and 10),
  unit_price_czk integer not null check (unit_price_czk >= 0),
  total_czk integer generated always as (quantity * unit_price_czk) stored
);
create table if not exists public.appointments (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null unique, branch text not null,
  slot_id uuid not null, seat integer not null check (seat>0),
  status public.bubu_order_status not null default 'provisional',
  hold_expires_at timestamptz, revision integer not null default 1 check (revision>0),
  confirmed_at timestamptz,
  foreign key (order_id,branch) references public.orders(id,branch),
  foreign key (slot_id,branch) references public.appointment_slots(id,branch),
  check (status<>'provisional' or hold_expires_at is not null)
);
create unique index if not exists appointments_active_seat on public.appointments(slot_id,seat)
  where status not in ('cancelled','expired');
create index if not exists appointments_expiry on public.appointments(hold_expires_at) where status='provisional';
create index if not exists orders_created on public.orders(created_at desc);
create index if not exists orders_branch_status on public.orders(branch,status);

create table if not exists public.consent_records (
  id uuid primary key default gen_random_uuid(), order_id uuid not null references public.orders(id),
  purpose text not null check (purpose in ('terms','marketing')),
  version text not null, wording text not null check (length(wording)>0),
  accepted boolean not null, recorded_at timestamptz not null default now(),
  source text not null check (source in ('web','withdrawal','local-test')),
  check (purpose<>'terms' or accepted)
);
create table if not exists public.verification_tokens (
  id uuid primary key default gen_random_uuid(), order_id uuid not null references public.orders(id),
  purpose text not null check (purpose in ('verify','manage','withdraw_marketing')),
  token_hash text not null unique check (token_hash ~ '^[a-f0-9]{64}$'),
  expires_at timestamptz not null, used_at timestamptz,
  attempts integer not null default 0 check (attempts between 0 and 10)
);
create table if not exists public.notification_jobs (
  id uuid primary key default gen_random_uuid(), order_id uuid not null references public.orders(id),
  appointment_id uuid not null references public.appointments(id), revision integer not null,
  kind text not null check (kind in ('verification','confirmation','reminder_24h','reminder_2h','changed','cancelled')),
  idempotency_key text not null unique, due_at timestamptz not null,
  status text not null default 'pending' check (status in ('pending','processing','sent','cancelled','failed')),
  attempts integer not null default 0 check (attempts>=0), locked_until timestamptz,
  sent_at timestamptz
);
create index if not exists notification_due on public.notification_jobs(due_at) where status='pending';
create table if not exists public.audit_log (
  id uuid primary key default gen_random_uuid(), actor_id uuid references auth.users(id),
  action text not null, target_id uuid not null, created_at timestamptz not null default now(),
  -- Only operational fields, never contacts, token hashes or message contents.
  metadata jsonb not null default '{}'::jsonb check (jsonb_typeof(metadata)='object')
);
create table if not exists bubu_private.rate_limit_buckets (
  bucket_hash text primary key, window_start timestamptz not null,
  expires_at timestamptz not null, requests integer not null check (requests>0)
);

-- Default deny for every table, including service endpoints and token stores.
do $$ declare t text; begin
  foreach t in array array['staff_members','booking_settings','opening_hours','schedule_exceptions',
    'appointment_slots','orders','order_items','appointments','consent_records','verification_tokens',
    'notification_jobs','audit_log'] loop
    execute format('alter table public.%I enable row level security',t);
    execute format('revoke all on public.%I from public, anon, authenticated',t);
    execute format('grant select, insert, update, delete on public.%I to service_role',t);
  end loop;
end $$;
alter table bubu_private.rate_limit_buckets enable row level security;
revoke all on bubu_private.rate_limit_buckets from public,anon,authenticated;
grant select,insert,update,delete on bubu_private.rate_limit_buckets to service_role;

-- Authenticated staff must have an active registry entry AND aal2 for each read.
do $$ declare t text; begin
  foreach t in array array['booking_settings','opening_hours','schedule_exceptions','appointment_slots',
    'orders','order_items','appointments','consent_records','audit_log'] loop
    execute format('grant select on public.%I to authenticated',t);
    execute format('drop policy if exists staff_read on public.%I',t);
    execute format('create policy staff_read on public.%I for select to authenticated using (bubu_private.staff_role() in (''owner'',''operations''))',t);
  end loop;
end $$;
grant select on public.staff_members to authenticated;
drop policy if exists owner_read_staff on public.staff_members;
create policy owner_read_staff on public.staff_members for select to authenticated
  using (bubu_private.staff_role()='owner' or (user_id=auth.uid() and bubu_private.staff_role()='operations'));
-- No direct staff writes. Audited write RPCs will be added with the admin module.
revoke update,delete on public.audit_log from service_role;
revoke update,delete on public.consent_records from service_role;

