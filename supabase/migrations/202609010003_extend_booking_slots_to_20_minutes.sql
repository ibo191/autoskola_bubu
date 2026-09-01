-- Extend enrollment appointment slots from 10 to 20 minutes.
update public.booking_settings
set duration_minutes = 20
where branch in ('strizkov', 'statenice', 'kladno');

-- Future slots are regenerated at the new duration. Existing occupied slots are kept intact.
delete from public.appointment_slots s
where s.starts_at > clock_timestamp()
  and not exists (
    select 1 from public.appointments a
    where a.slot_id = s.id and a.status not in ('cancelled','expired')
  );
