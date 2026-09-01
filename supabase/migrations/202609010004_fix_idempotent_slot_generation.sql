-- Make automatic slot generation idempotent.
-- PostgreSQL fires BEFORE INSERT triggers before ON CONFLICT DO NOTHING,
-- so an already generated slot with the same branch/start must be allowed
-- to reach the unique constraint instead of failing on the overlap check.
create or replace function bubu_private.check_slot_write() returns trigger
language plpgsql security definer set search_path='' as $$
begin
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(new.branch,0));

  if tg_op = 'INSERT' and exists (
    select 1 from public.appointment_slots s
    where s.branch = new.branch and s.starts_at = new.starts_at
  ) then
    return new;
  end if;

  if exists(select 1 from public.appointment_slots s where s.branch=new.branch and s.id<>new.id
    and tstzrange(s.starts_at,s.ends_at,'[)') && tstzrange(new.starts_at,new.ends_at,'[)')) then
    raise exception 'OVERLAPPING_SLOT';
  end if;

  if tg_op='UPDATE' and exists(select 1 from public.appointments where slot_id=new.id and status not in ('cancelled','expired')) then
    if new.starts_at<>old.starts_at or new.ends_at<>old.ends_at or new.branch<>old.branch
      or new.capacity<(select max(seat) from public.appointments where slot_id=new.id and status not in ('cancelled','expired')) then
      raise exception 'OCCUPIED_SLOT_CHANGE';
    end if;
  end if;
  return new;
end $$;

revoke all on function bubu_private.check_slot_write() from public,anon,authenticated;
