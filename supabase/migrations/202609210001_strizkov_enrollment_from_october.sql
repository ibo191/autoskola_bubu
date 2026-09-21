-- Do not offer new Střížkov enrolment appointments before 1 October 2026.
-- Existing confirmed appointments remain intact; only free slots are withdrawn.

insert into public.schedule_exceptions(branch, local_date, kind)
select 'strizkov', day::date, 'closed'
from generate_series(date '2026-09-01', date '2026-09-30', interval '1 day') as day
where not exists (
  select 1
  from public.schedule_exceptions existing
  where existing.branch = 'strizkov'
    and existing.local_date = day::date
    and existing.kind = 'closed'
);

update public.appointment_slots slot
set blocked = true
where slot.branch = 'strizkov'
  and (slot.starts_at at time zone 'Europe/Prague')::date < date '2026-10-01'
  and slot.starts_at > clock_timestamp()
  and not exists (
    select 1
    from public.appointments appointment
    where appointment.slot_id = slot.id
      and appointment.status not in ('cancelled', 'expired')
  );

create or replace function bubu_private.reject_closed_enrollment_slot() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  slot public.appointment_slots;
begin
  select * into slot
  from public.appointment_slots
  where id = new.slot_id and branch = new.branch;

  if not found then
    raise exception 'INVALID_SLOT';
  end if;

  if new.branch = 'strizkov'
    and (slot.starts_at at time zone 'Europe/Prague')::date < date '2026-10-01' then
    raise exception 'ENROLLMENT_NOT_OPEN';
  end if;

  return new;
end $$;

revoke all on function bubu_private.reject_closed_enrollment_slot() from public, anon, authenticated;
grant execute on function bubu_private.reject_closed_enrollment_slot() to service_role;

drop trigger if exists bubu_validate_appointment_enrollment_date on public.appointments;
create trigger bubu_validate_appointment_enrollment_date
before insert or update of slot_id, branch on public.appointments
for each row execute function bubu_private.reject_closed_enrollment_slot();
