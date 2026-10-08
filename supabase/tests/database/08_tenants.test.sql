begin;
create extension if not exists pgtap with schema extensions;
select plan(24);

-- Two tenants, one member each, plus a user without any tenant.
insert into auth.users (id, email) values
  ('11111111-1111-4111-8111-111111111111', 'a@test.local'),
  ('22222222-2222-4222-8222-222222222222', 'b@test.local'),
  ('33333333-3333-4333-8333-333333333333', 'none@test.local');
insert into public.tenants (id, name) values
  ('aaaaaaaa-0000-4000-8000-00000000000a', 'PGTAP Betrieb A'),
  ('bbbbbbbb-0000-4000-8000-00000000000b', 'PGTAP Betrieb B');
insert into private.tenant_members (tenant_id, user_id) values
  ('aaaaaaaa-0000-4000-8000-00000000000a', '11111111-1111-4111-8111-111111111111'),
  ('bbbbbbbb-0000-4000-8000-00000000000b', '22222222-2222-4222-8222-222222222222');
insert into public.settings (tenant_id) values
  ('aaaaaaaa-0000-4000-8000-00000000000a'), ('bbbbbbbb-0000-4000-8000-00000000000b');
insert into public.customers (tenant_id, name) values
  ('aaaaaaaa-0000-4000-8000-00000000000a', 'PGTAP08 Kunde A'),
  ('bbbbbbbb-0000-4000-8000-00000000000b', 'PGTAP08 Kunde B');
insert into public.articles (tenant_id, name, unit_price_gross, vat_rate) values
  ('bbbbbbbb-0000-4000-8000-00000000000b', 'PGTAP08 Artikel B', 1, 7);
insert into public.invoices (tenant_id, number, recipient, service_date_from) values
  ('aaaaaaaa-0000-4000-8000-00000000000a', 'PGTAP08-1', '{}', '2026-10-08'),
  ('bbbbbbbb-0000-4000-8000-00000000000b', 'PGTAP08-1', '{}', '2026-10-08');

-- 1) Database-level integrity (as owner, RLS not involved)
select pass('same invoice number in two tenants is allowed');
select throws_ok(
  $$insert into public.invoices (tenant_id, number, recipient, service_date_from)
    values ('aaaaaaaa-0000-4000-8000-00000000000a', 'PGTAP08-1', '{}', '2026-10-08')$$,
  '23505', null, 'invoice number is unique within a tenant');
select throws_ok(
  $$insert into public.invoices (tenant_id, number, recipient, service_date_from, customer_id)
    values ('aaaaaaaa-0000-4000-8000-00000000000a', 'PGTAP08-X', '{}', '2026-10-08',
      (select id from public.customers where name = 'PGTAP08 Kunde B'))$$,
  '23503', null, 'invoice cannot reference a customer of another tenant');
select throws_ok(
  $$insert into public.invoice_items (tenant_id, invoice_id, position, description, quantity, unit_price_gross, vat_rate, article_id)
    values ('aaaaaaaa-0000-4000-8000-00000000000a',
      (select id from public.invoices where number = 'PGTAP08-1' and tenant_id = 'aaaaaaaa-0000-4000-8000-00000000000a'),
      0, 'x', 1, 1, 7, (select id from public.articles where name = 'PGTAP08 Artikel B'))$$,
  '23503', null, 'item cannot reference an article of another tenant');
select throws_ok(
  $$insert into public.invoice_items (tenant_id, invoice_id, position, description, quantity, unit_price_gross, vat_rate)
    values ('aaaaaaaa-0000-4000-8000-00000000000a',
      (select id from public.invoices where number = 'PGTAP08-1' and tenant_id = 'bbbbbbbb-0000-4000-8000-00000000000b'),
      0, 'x', 1, 1, 7)$$,
  '23503', null, 'item cannot belong to an invoice of another tenant');
select throws_ok(
  $$update public.customers set tenant_id = 'bbbbbbbb-0000-4000-8000-00000000000b' where name = 'PGTAP08 Kunde A'$$,
  '42501', null, 'tenant_id of a row cannot be changed');

-- 2) Member of A
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"11111111-1111-4111-8111-111111111111","role":"authenticated"}', true);
select results_eq($$select name from public.tenants where name like 'PGTAP%'$$, $$values ('PGTAP Betrieb A'::text)$$, 'A: sees only its tenant');
select results_eq($$select name from public.customers where name like 'PGTAP08%'$$, $$values ('PGTAP08 Kunde A'::text)$$, 'A: sees only its customers');
select is((select count(*)::int from public.settings where tenant_id = 'bbbbbbbb-0000-4000-8000-00000000000b'), 0, 'A: settings of B invisible');
select is((select count(*)::int from public.invoices where tenant_id = 'bbbbbbbb-0000-4000-8000-00000000000b'), 0, 'A: invoices of B invisible');
select throws_ok(
  $$insert into public.customers (tenant_id, name) values ('bbbbbbbb-0000-4000-8000-00000000000b', 'Hack')$$,
  '42501', null, 'A: cannot insert into B');
update public.customers set name = 'Hack' where name = 'PGTAP08 Kunde B';
select lives_ok($$update public.tenants set name = 'PGTAP Betrieb A2' where id = 'aaaaaaaa-0000-4000-8000-00000000000a'$$, 'A: can rename its tenant');
update public.tenants set name = 'Hack' where id = 'bbbbbbbb-0000-4000-8000-00000000000b';
select throws_ok($$insert into public.tenants (name) values ('Direkt')$$, '42501', null, 'A: no direct tenant insert');
select throws_ok($$delete from public.tenants$$, '42501', null, 'A: no tenant delete');
select throws_ok($$select * from private.tenant_members$$, '42501', null, 'A: memberships not readable');

-- create_tenant
create temp table new_tenant (id uuid);
grant all on new_tenant to authenticated;
insert into new_tenant select public.create_tenant('  PGTAP Neu  ');
select results_eq($$select name from public.tenants where id = (select id from new_tenant)$$, $$values ('PGTAP Neu'::text)$$, 'create_tenant: trimmed name, visible to creator');
select is((select company ->> 'name' from public.settings where tenant_id = (select id from new_tenant)), 'PGTAP Neu', 'create_tenant: settings row with company name');
select throws_ok($$select public.create_tenant('   ')$$, '22023', null, 'create_tenant: blank name rejected');
select throws_ok($$select public.create_tenant(repeat('x', 121))$$, '22023', null, 'create_tenant: name longer than 120 rejected');
reset role;

select is((select role from private.tenant_members where tenant_id = (select id from new_tenant)), 'owner', 'create_tenant: creator is owner');
select results_eq(
  $$select name from public.customers where name in ('PGTAP08 Kunde B', 'Hack')$$, $$values ('PGTAP08 Kunde B'::text)$$,
  'A: update on B had no effect');
select is((select name from public.tenants where id = 'bbbbbbbb-0000-4000-8000-00000000000b'), 'PGTAP Betrieb B', 'A: rename of B had no effect');

-- 3) User without any tenant may not create one (M10 rule, spec 3a)
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"33333333-3333-4333-8333-333333333333","role":"authenticated"}', true);
select throws_ok($$select public.create_tenant('Fremd')$$, '42501', null, 'user without tenant cannot create one');
reset role;

set local role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', true);
select throws_ok($$select public.create_tenant('Anon')$$, '42501', null, 'anon cannot call create_tenant');
reset role;

select * from finish();
rollback;
