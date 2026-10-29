-- Keep the waitlist separate from orders while recording the requested training variant.
alter table public.moto_interest
  add column if not exists first_name text,
  add column if not exists last_name text,
  add column if not exists licence_status text,
  add column if not exists held_licences text[] not null default '{}',
  add column if not exists holding_period text,
  add column if not exists package text;

alter table public.moto_interest
  add constraint moto_interest_first_name_check check (first_name is null or length(first_name) between 2 and 80),
  add constraint moto_interest_last_name_check check (last_name is null or length(last_name) between 2 and 80),
  add constraint moto_interest_licence_status_check check (licence_status is null or licence_status in ('none', 'yes')),
  add constraint moto_interest_held_licences_check check (held_licences <@ array['B','AM','A1','A2','A','other']::text[]),
  add constraint moto_interest_holding_period_check check (holding_period is null or holding_period in ('less-than-two', 'more-than-two')),
  add constraint moto_interest_package_check check (package is null or package in ('moto-basic', 'moto-confidence', 'supplement'));
