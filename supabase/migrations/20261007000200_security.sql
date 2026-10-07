-- Access control in two layers:
-- 1) Grants: anon/public get nothing; authenticated only what the app needs.
-- 2) RLS: authenticated users see/change data only if private.is_member() is true.

-- GraphQL is not used -> remove the attack surface.
drop extension if exists pg_graphql;

-- 1) Reset grants (Supabase grants privileges to anon/authenticated by default).
revoke all on all tables in schema public from anon, authenticated, public;
revoke all on all sequences in schema public from anon, authenticated, public;
revoke all on all functions in schema public from anon, authenticated, public;

alter default privileges for role postgres in schema public revoke all on tables from anon, authenticated, public;
alter default privileges for role postgres in schema public revoke all on sequences from anon, authenticated, public;
alter default privileges for role postgres in schema public revoke all on functions from anon, authenticated, public;

grant select, insert, update, delete
  on public.customers, public.articles, public.invoices, public.invoice_items, public.invoice_exports
  to authenticated;
grant select, update on public.settings to authenticated;

-- Schema private: nothing for anon; authenticated only needs USAGE to evaluate is_member() in policies.
revoke all on schema private from public, anon;
grant usage on schema private to authenticated;
revoke all on all tables in schema private from public, anon, authenticated;
-- private.members has no grants: it is read exclusively through private.is_member() (security definer).

-- Membership check. Lives in "private" so it cannot be called as an RPC through the Data API.
create function private.is_member() returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from private.members m where m.user_id = (select auth.uid()));
$$;
revoke all on function private.is_member() from public, anon;
grant execute on function private.is_member() to authenticated;

-- 2) RLS
-- members: RLS on, no policy, no grants -> only the owner (is_member as security definer) can read it.
alter table private.members enable row level security;

-- No FORCE ROW LEVEL SECURITY: it would only restrict the table owner (postgres = admin),
-- who can disable RLS anyway. No security gain, but a risk for migrations and seeding.
do $$
declare t text;
begin
  foreach t in array array['settings', 'customers', 'articles', 'invoices', 'invoice_items', 'invoice_exports'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format(
      'create policy members_all on public.%I for all to authenticated '
      'using ((select private.is_member())) with check ((select private.is_member()))',
      t
    );
  end loop;
end;
$$;
