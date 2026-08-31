-- EXPLICITLY FICTITIOUS FIXTURES, NOT APPROVED BUSINESS CONFIGURATION.
-- No users, contacts, orders, credentials or customer data.
-- Booking remains disabled until local DB tests and the server workflow are implemented.
insert into public.booking_settings(branch,duration_minutes,capacity,hold_minutes,fixture_only,enabled) values
  ('strizkov',15,1,15,true,false),('kladno',15,1,15,true,false),('statenice',15,1,15,true,false);
-- Deliberately common test hours, not a claim about actual branch office hours.
insert into public.opening_hours(branch,weekday,opens_at,closes_at)
select branch,1,'15:00'::time,'18:00'::time from public.booking_settings;
