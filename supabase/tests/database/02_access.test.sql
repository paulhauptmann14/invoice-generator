begin;
create extension if not exists pgtap with schema extensions;
select plan(22);

insert into auth.users (id, email) values
  ('11111111-1111-1111-1111-111111111111', 'member@test.local'),
  ('22222222-2222-2222-2222-222222222222', 'stranger@test.local');
insert into private.members (user_id) values ('11111111-1111-1111-1111-111111111111');

-- 1) anonymous: no privileges at all (grant level -> 42501 permission denied)
set local role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', true);
select throws_ok('select * from public.customers', '42501', null, 'anon: customers denied');
select throws_ok('select * from public.articles', '42501', null, 'anon: articles denied');
select throws_ok('select * from public.invoices', '42501', null, 'anon: invoices denied');
select throws_ok('select * from public.invoice_items', '42501', null, 'anon: invoice_items denied');
select throws_ok('select * from public.invoice_exports', '42501', null, 'anon: invoice_exports denied');
select throws_ok('select * from public.settings', '42501', null, 'anon: settings denied');
select throws_ok('select * from private.members', '42501', null, 'anon: members denied');
select throws_ok('select private.is_member()', '42501', null, 'anon: is_member() not executable');
reset role;

-- 2) member: full access
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}', true);
select is(private.is_member(), true, 'member is recognized');
select lives_ok($$insert into public.customers (name) values ('Kunde A')$$, 'member: can create a customer');
select is((select count(*)::int from public.customers where name = 'Kunde A'), 1, 'member: customer is visible');
select lives_ok($$insert into public.articles (name, unit_price_gross, vat_rate) values ('Buffet', 24.90, 7)$$, 'member: can create an article');
select lives_ok($$update public.settings set default_payment_days = 30$$, 'member: can update settings');
select is((select default_payment_days from public.settings), 30, 'member: settings change is stored');
select throws_ok($$delete from public.settings$$, '42501', null, 'member: settings cannot be deleted');
select throws_ok('select * from private.members', '42501', null, 'member: members table not directly readable');
reset role;

-- 3) authenticated but not a member: sees nothing, may do nothing
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}', true);
select is(private.is_member(), false, 'stranger is not a member');
select is((select count(*)::int from public.customers), 0, 'stranger: no customers visible');
select is((select count(*)::int from public.settings), 0, 'stranger: no settings visible');
select throws_ok($$insert into public.customers (name) values ('Hack')$$, '42501', null, 'stranger: insert blocked by RLS');
update public.customers set name = 'Hack';
reset role;
select is((select count(*)::int from public.customers where name = 'Hack'), 0, 'stranger: update has no effect');

-- 4) RLS is enabled on every table in public
select is(
  (select count(*)::int from pg_class c join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public' and c.relkind = 'r' and not c.relrowsecurity),
  0, 'RLS enabled on all public tables'
);

select * from finish();
rollback;
