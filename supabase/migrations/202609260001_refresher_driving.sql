-- Add refresher driving without changing the existing booking transactions.
alter table public.orders drop constraint orders_course_check;
alter table public.orders add constraint orders_course_check
  check (course in ('b','b-automat','l17','am','a1','a2','a','b96','be','kondicni'));
alter table public.orders drop constraint orders_check;
alter table public.orders add constraint orders_check
  check (branch='strizkov' or course in ('b','l17','kondicni'));
alter table public.orders add constraint orders_refresher_selection_check check (
  course <> 'kondicni' or (
    selection->>'drivingBlocks' is not null
    and (selection->>'drivingBlocks')::numeric between 1 and 20
    and (selection->>'drivingBlocks')::numeric = trunc((selection->>'drivingBlocks')::numeric)
    and selection->>'transmission' is not null
    and selection->>'transmission' in ('manual','automatic')
    and (branch='strizkov' or selection->>'transmission'='manual')
    and total_czk = (selection->>'drivingBlocks')::numeric * 1600
  )
);
