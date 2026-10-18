begin;
create extension if not exists pgtap with schema extensions;
select plan(14);

-- Open registration: a fresh account (no membership) creates its own business and sees nothing of others.
insert into auth.users (id, email) values
  ('11111111-1111-4111-8111-111111111111', 'existing@test.local'),
  ('33333333-3333-4333-8333-333333333333', 'new@test.local');
insert into public.tenants (id, name) values ('aaaaaaaa-0000-4000-8000-00000000000a', 'PGTAP11 Bestand');
insert into private.tenant_members (tenant_id, user_id) values ('aaaaaaaa-0000-4000-8000-00000000000a', '11111111-1111-4111-8111-111111111111');
insert into public.settings (tenant_id) values ('aaaaaaaa-0000-4000-8000-00000000000a');
insert into public.customers (tenant_id, name) values ('aaaaaaaa-0000-4000-8000-00000000000a', 'PGTAP11 Kunde');

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"33333333-3333-4333-8333-333333333333","role":"authenticated"}', true);

select ok(private.can_create_tenant(), 'a user without any membership may create a business');
select is((select count(*)::int from public.tenants), 0, 'before creating: sees no tenants (not even the seed ones)');

create temp table new_tenant (id uuid);
grant all on new_tenant to authenticated;
insert into new_tenant select public.create_tenant('PGTAP11 Eigener Betrieb');
select ok((select id is not null from new_tenant), 'create_tenant works for the fresh user');
select results_eq($$select name from public.tenants$$, $$values ('PGTAP11 Eigener Betrieb'::text)$$, 'sees exactly its own business');
select is((select count(*)::int from public.customers), 0, 'sees no customers of other businesses');
select is((select count(*)::int from public.invoices), 0, 'sees no invoices of other businesses');
select results_eq($$select tenant_id from public.settings$$, $$select id from new_tenant$$, 'sees only its own settings');
select is((select count(*)::int from public.customers where tenant_id = 'aaaaaaaa-0000-4000-8000-00000000000a'), 0, 'foreign tenant is invisible by id');
select throws_ok(
  $$insert into public.customers (tenant_id, name) values ('aaaaaaaa-0000-4000-8000-00000000000a', 'Hack')$$,
  '42501', null, 'cannot write into a foreign tenant');
reset role;

select is((select role from private.tenant_members where tenant_id = (select id from new_tenant)), 'owner', 'the new user is owner of the new business');
select is((select count(*)::int from private.tenant_members where tenant_id = 'aaaaaaaa-0000-4000-8000-00000000000a'), 1, 'no membership was added to the existing business');

set local role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', true);
select throws_ok($$select public.create_tenant('Anon')$$, '42501', null, 'anon still cannot create a business');
select throws_ok($$select private.can_create_tenant()$$, '42501', null, 'anon cannot evaluate can_create_tenant');
reset role;

select ok(
  not has_function_privilege('anon', 'private.can_create_tenant()', 'execute')
    and has_function_privilege('authenticated', 'private.can_create_tenant()', 'execute'),
  'grants unchanged: authenticated yes, anon no');

select * from finish();
rollback;
