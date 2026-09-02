-- Avoid ambiguous token_hash references in admin session RPCs.
create or replace function public.bubu_admin_session(p_token text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare
  v_token_hash text := encode(extensions.digest(coalesce(p_token, ''), 'sha256'), 'hex');
  account bubu_private.admin_users;
begin
  perform bubu_private.clean_admin_sessions();
  select u.* into account
  from bubu_private.admin_sessions s
  join bubu_private.admin_users u on u.email = s.email
  where s.token_hash = v_token_hash and s.expires_at > clock_timestamp() and u.active;
  if not found then
    return jsonb_build_object('ok', false);
  end if;
  update bubu_private.admin_sessions set last_seen_at = clock_timestamp() where admin_sessions.token_hash = v_token_hash;
  return jsonb_build_object('ok', true, 'user', jsonb_build_object('email', account.email, 'name', account.name));
end $$;
revoke all on function public.bubu_admin_session(text) from public, anon, authenticated;
grant execute on function public.bubu_admin_session(text) to service_role;

create or replace function public.bubu_admin_logout(p_token text) returns jsonb
language sql security definer set search_path='' as $$
  delete from bubu_private.admin_sessions where token_hash = encode(extensions.digest(coalesce(p_token, ''), 'sha256'), 'hex');
  select jsonb_build_object('ok', true);
$$;
revoke all on function public.bubu_admin_logout(text) from public, anon, authenticated;
grant execute on function public.bubu_admin_logout(text) to service_role;
