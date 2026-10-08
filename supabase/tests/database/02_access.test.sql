begin;
create extension if not exists pgtap with schema extensions;
select plan(26);

insert into auth.users (id, email) values
  ('11111111-1111-4111-8111-111111111111', 'member@test.local'),
  ('22222222-2222-4222-8222-222222222222', 'stranger@test.local');
insert into public.tenants (id, name) values ('aaaaaaaa-0000-4000-8000-00000000000a', 'PGTAP Betrieb A');
insert into private.tenant_members (tenant_id, user_id) values ('aaaaaaaa-0000-4000-8000-00000000000a', '11111111-1111-4111-8111-111111111111');
insert into public.settings (tenant_id) values ('aaaaaaaa-0000-4000-8000-00000000000a');

-- 1) anonymous: no privileges at all (grant level -> 42501 permission denied)
set local role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', true);
select throws_ok('select * from public.tenants', '42501', null, 'anon: tenants denied');
select throws_ok('select * from public.customers', '42501', null, 'anon: customers denied');
select throws_ok('select * from public.articles', '42501', null, 'anon: articles denied');
select throws_ok('select * from public.invoices', '42501', null, 'anon: invoices denied');
select throws_ok('select * from public.invoice_items', '42501', null, 'anon: invoice_items denied');
select throws_ok('select * from public.invoice_exports', '42501', null, 'anon: invoice_exports denied');
select throws_ok('select * from public.settings', '42501', null, 'anon: settings denied');
select throws_ok('select * from private.tenant_members', '42501', null, 'anon: tenant_members denied');
select throws_ok($$select private.is_tenant_member('aaaaaaaa-0000-4000-8000-00000000000a')$$, '42501', null, 'anon: is_tenant_member() not executable');
reset role;

-- 2) member: full access to its tenant
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"11111111-1111-4111-8111-111111111111","role":"authenticated"}', true);
select is(private.is_tenant_member('aaaaaaaa-0000-4000-8000-00000000000a'), true, 'member is recognized');
select lives_ok($$insert into public.customers (tenant_id, name) values ('aaaaaaaa-0000-4000-8000-00000000000a', 'Kunde A')$$, 'member: can create a customer');
select is((select count(*)::int from public.customers where name = 'Kunde A'), 1, 'member: customer is visible');
select lives_ok($$insert into public.articles (tenant_id, name, unit_price_gross, vat_rate) values ('aaaaaaaa-0000-4000-8000-00000000000a', 'Buffet', 24.90, 7)$$, 'member: can create an article');
select lives_ok($$update public.settings set default_payment_days = 30 where tenant_id = 'aaaaaaaa-0000-4000-8000-00000000000a'$$, 'member: can update settings');
select is((select default_payment_days from public.settings where tenant_id = 'aaaaaaaa-0000-4000-8000-00000000000a'), 30, 'member: settings change is stored');
select throws_ok($$delete from public.settings$$, '42501', null, 'member: settings cannot be deleted');
select throws_ok($$insert into public.settings (tenant_id) values ('aaaaaaaa-0000-4000-8000-00000000000a')$$, '42501', null, 'member: settings cannot be inserted');
select throws_ok('select * from private.tenant_members', '42501', null, 'member: memberships not directly readable');
reset role;

-- 3) authenticated but without tenant: sees nothing, may do nothing
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"22222222-2222-4222-8222-222222222222","role":"authenticated"}', true);
select is(private.is_tenant_member('aaaaaaaa-0000-4000-8000-00000000000a'), false, 'stranger is not a member');
select is((select count(*)::int from public.tenants), 0, 'stranger: no tenants visible');
select is((select count(*)::int from public.customers), 0, 'stranger: no customers visible');
select is((select count(*)::int from public.settings), 0, 'stranger: no settings visible');
select throws_ok($$insert into public.customers (tenant_id, name) values ('aaaaaaaa-0000-4000-8000-00000000000a', 'Hack')$$, '42501', null, 'stranger: insert blocked by RLS');
update public.customers set name = 'Hack';
reset role;
select is((select count(*)::int from public.customers where name = 'Hack'), 0, 'stranger: update has no effect');

-- 4) RLS is enabled on every table in public; no security definer function is exposed
select is(
  (select count(*)::int from pg_class c join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public' and c.relkind = 'r' and not c.relrowsecurity),
  0, 'RLS enabled on all public tables'
);
select is(
  (select count(*)::int from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.prosecdef),
  0, 'no security definer functions in public'
);

select * from finish();
rollback;
