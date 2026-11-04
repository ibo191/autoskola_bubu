-- Make school attribution queryable without creating duplicate order records.
alter table public.school_groups
  add column if not exists partner_school text generated always as (school_code) stored;

alter table public.orders
  add column if not exists partner_school text generated always as (selection->>'partnerSchool') stored;

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'orders_partner_school_check') then
    alter table public.orders
      add constraint orders_partner_school_check
      check (partner_school is null or partner_school = 'gymnazium_manna');
  end if;
end $$;

create index if not exists orders_partner_school_created
  on public.orders(partner_school, created_at desc)
  where partner_school is not null;
