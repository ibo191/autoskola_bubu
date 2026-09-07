-- Campaign landing pages: Black Friday course bonus and Christmas voucher requests.

create table if not exists public.campaign_requests (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  campaign_id text not null check (campaign_id in ('black-friday','vanoce')),
  status text not null default 'received' check (status in ('received','contacted','converted','cancelled')),
  contact jsonb not null check (jsonb_typeof(contact)='object'),
  selection jsonb not null default '{}'::jsonb check (jsonb_typeof(selection)='object'),
  payload jsonb not null default '{}'::jsonb check (jsonb_typeof(payload)='object'),
  amount_due_czk integer check (amount_due_czk is null or amount_due_czk >= 0),
  payment_status text not null default 'not_required' check (payment_status in ('not_required','pending_future_payment','pending','paid','cancelled','failed')),
  consent_terms jsonb not null check (jsonb_typeof(consent_terms)='object'),
  consent_privacy jsonb not null check (jsonb_typeof(consent_privacy)='object'),
  consent_marketing jsonb not null check (jsonb_typeof(consent_marketing)='object')
);

create index if not exists campaign_requests_campaign_created on public.campaign_requests(campaign_id, created_at desc);
create index if not exists campaign_requests_status_created on public.campaign_requests(status, created_at desc);

alter table public.campaign_requests enable row level security;
revoke all on public.campaign_requests from public, anon, authenticated;
grant select, insert, update on public.campaign_requests to service_role;
