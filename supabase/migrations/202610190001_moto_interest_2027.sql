-- A season-2027 notification list, deliberately separate from orders and reservations.
create table if not exists public.moto_interest (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  season integer not null default 2027 check (season = 2027),
  name text not null check (length(name) between 2 and 120),
  email text not null check (length(email) between 3 and 254 and email = lower(email)),
  phone text not null check (phone ~ '^\+[1-9][0-9]{7,14}$'),
  course text not null check (course in ('am', 'a1', 'a2', 'a')),
  status text not null default 'waiting' check (status in ('waiting', 'notified', 'withdrawn')),
  notification_consent_at timestamptz not null,
  notification_consent_version text not null,
  source text not null check (source in ('cenik', 'course', 'direct')),
  unique (season, email)
);
create index if not exists moto_interest_status_created on public.moto_interest(status, created_at desc);
alter table public.moto_interest enable row level security;
revoke all on public.moto_interest from public, anon, authenticated, service_role;
grant select, insert, update on public.moto_interest to service_role;
