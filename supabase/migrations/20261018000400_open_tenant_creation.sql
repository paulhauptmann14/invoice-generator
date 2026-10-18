-- Self-registration: every signed-in user may create businesses. Each new account only ever sees its
-- own businesses (RLS is membership based and unchanged), so this opens no access to existing data.
-- Whether sign-up is reachable at all is decided by the auth configuration (GOTRUE_DISABLE_SIGNUP).
create or replace function private.can_create_tenant() returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select (select auth.uid()) is not null;
$$;
revoke all on function private.can_create_tenant() from public, anon;
grant execute on function private.can_create_tenant() to authenticated;
