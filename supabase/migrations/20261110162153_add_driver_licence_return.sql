-- Licence return uses the existing in-person booking transaction.
alter table public.orders
  drop constraint orders_course_check,
  add constraint orders_course_check
    check (course in ('b','b-automat','l17','am','a1','a2','a','b96','be','kondicni','vraceni')),
  drop constraint orders_check,
  add constraint orders_check
    check (branch='strizkov' or course in ('b','l17','kondicni') or (branch='statenice' and course='vraceni')),
  drop constraint if exists orders_licence_return_selection_check,
  add constraint orders_licence_return_selection_check
    check (
      course <> 'vraceni' or (
        coalesce(selection->>'transmission', '') in ('manual','automatic')
        and (branch='strizkov' or selection->>'transmission'='manual')
        and case
          when coalesce(selection->>'drivingBlocks', '0') ~ '^(0|[1-9]|1[0-9]|20)$'
            then total_czk = 7000 + coalesce(selection->>'drivingBlocks', '0')::integer * 1600
          else false
        end
      )
    );
