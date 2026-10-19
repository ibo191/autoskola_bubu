-- Click identifiers are private and available only to the server role.
create table if not exists bubu_private.order_ad_attribution (
  order_id uuid primary key references public.orders(id) on delete cascade,
  gclid text, gbraid text, wbraid text,
  utm jsonb not null default '{}'::jsonb,
  landing_page text not null,
  first_click_at timestamptz not null,
  consent_at timestamptz not null,
  recorded_at timestamptz not null default now(),
  check (gclid is not null or gbraid is not null or wbraid is not null or utm <> '{}'::jsonb)
);
alter table bubu_private.order_ad_attribution enable row level security;
revoke all on bubu_private.order_ad_attribution from public, anon, authenticated;
grant select, insert on bubu_private.order_ad_attribution to service_role;

create or replace function public.bubu_store_order_attribution(p_order_id uuid, p_attribution jsonb)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if auth.role() <> 'service_role' then
    raise exception 'Not authorized';
  end if;
  if p_attribution is null or jsonb_typeof(p_attribution) <> 'object'
    or length(coalesce(p_attribution->>'landingPage', '')) > 2048
    or length(coalesce(p_attribution->>'gclid', '')) > 256
    or length(coalesce(p_attribution->>'gbraid', '')) > 256
    or length(coalesce(p_attribution->>'wbraid', '')) > 256 then
    raise exception 'Invalid attribution';
  end if;
  insert into bubu_private.order_ad_attribution
    (order_id, gclid, gbraid, wbraid, utm, landing_page, first_click_at, consent_at)
  values
    (p_order_id, nullif(p_attribution->>'gclid', ''), nullif(p_attribution->>'gbraid', ''),
     nullif(p_attribution->>'wbraid', ''), coalesce(p_attribution->'utm', '{}'::jsonb),
     p_attribution->>'landingPage', (p_attribution->>'firstClickAt')::timestamptz,
     (p_attribution->>'consentAt')::timestamptz)
  on conflict (order_id) do nothing;
end $$;
revoke all on function public.bubu_store_order_attribution(uuid,jsonb) from public, anon, authenticated;
grant execute on function public.bubu_store_order_attribution(uuid,jsonb) to service_role;
