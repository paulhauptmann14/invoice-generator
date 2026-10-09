begin;
create extension if not exists pgtap with schema extensions;
select plan(26);

insert into auth.users (id, email) values
  ('11111111-1111-4111-8111-111111111111', 'a@test.local'),
  ('22222222-2222-4222-8222-222222222222', 'b@test.local');
insert into public.tenants (id, name) values
  ('aaaaaaaa-0000-4000-8000-00000000000a', 'PGTAP Betrieb A'),
  ('bbbbbbbb-0000-4000-8000-00000000000b', 'PGTAP Betrieb B');
insert into private.tenant_members (tenant_id, user_id) values
  ('aaaaaaaa-0000-4000-8000-00000000000a', '11111111-1111-4111-8111-111111111111'),
  ('bbbbbbbb-0000-4000-8000-00000000000b', '22222222-2222-4222-8222-222222222222');

select has_table('public', 'number_ranges', 'number_ranges exists');
select hasnt_column('public', 'settings', 'number_format', 'settings.number_format is replaced by number_ranges');
select has_column('public', 'invoices', 'number_range_id', 'invoices remember their number range');

-- 1) Constraints (as owner)
insert into public.number_ranges (id, tenant_id, name, format, is_default) values
  ('a1000000-0000-4000-8000-000000000001', 'aaaaaaaa-0000-4000-8000-00000000000a', 'PGTAP Rechnungen', 'R{N}/{JJ}', true),
  ('a1000000-0000-4000-8000-000000000002', 'aaaaaaaa-0000-4000-8000-00000000000a', 'PGTAP Gutscheine', 'GU{N}/{JJ}', false);
select lives_ok(
  $$insert into public.number_ranges (id, tenant_id, name, format, is_default)
    values ('b1000000-0000-4000-8000-000000000001', 'bbbbbbbb-0000-4000-8000-00000000000b', 'PGTAP Rechnungen', 'B{NNN}', true)$$,
  'the same name is allowed in another tenant');
select throws_ok(
  $$insert into public.number_ranges (tenant_id, name, format, is_default) values ('aaaaaaaa-0000-4000-8000-00000000000a', 'PGTAP Zweiter', 'Z{N}', true)$$,
  '23505', null, 'only one default range per tenant');
select throws_ok(
  $$insert into public.number_ranges (tenant_id, name, format) values ('aaaaaaaa-0000-4000-8000-00000000000a', 'PGTAP Rechnungen', 'X{N}')$$,
  '23505', null, 'range names are unique within a tenant');
select throws_ok(
  $$insert into public.number_ranges (tenant_id, name, format) values ('aaaaaaaa-0000-4000-8000-00000000000a', 'PGTAP Ohne', 'G/{JJ}')$$,
  '23514', null, 'a format needs a counter');
select throws_ok(
  $$insert into public.number_ranges (tenant_id, name, format) values ('aaaaaaaa-0000-4000-8000-00000000000a', 'PGTAP Doppelt', 'X{N}-{NN}')$$,
  '23514', null, 'a format has exactly one counter');
select throws_ok(
  $$insert into public.number_ranges (tenant_id, name, format, is_default, archived_at) values ('bbbbbbbb-0000-4000-8000-00000000000b', 'PGTAP Alt', 'A{N}', true, now())$$,
  '23514', null, 'an archived range cannot be the default');
select throws_ok(
  $$insert into public.invoices (tenant_id, number, recipient, service_date_from, number_range_id)
    values ('aaaaaaaa-0000-4000-8000-00000000000a', 'PGTAP09-X', '{}', '2026-10-09', 'b1000000-0000-4000-8000-000000000001')$$,
  '23503', null, 'an invoice cannot use a range of another tenant');

select is(private.number_matches_format('G12/26', 'G{N}/{JJ}'), true, 'matches: counter and 2-digit year');
select is(private.number_matches_format('G12/2026', 'G{N}/{JJ}'), false, 'no match: 4-digit year for {JJ}');
select is(private.number_matches_format('2026-0001', '{JJJJ}-{NNNN}'), true, 'matches: default format');

-- 2) Member of A
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"11111111-1111-4111-8111-111111111111","role":"authenticated"}', true);
select lives_ok($$select public.set_default_number_range('aaaaaaaa-0000-4000-8000-00000000000a', 'a1000000-0000-4000-8000-000000000002')$$, 'member switches the default');
select results_eq(
  $$select name from public.number_ranges where tenant_id = 'aaaaaaaa-0000-4000-8000-00000000000a' and is_default$$,
  $$values ('PGTAP Gutscheine'::text)$$, 'exactly the new range is the default');
select throws_ok($$select public.set_default_number_range('aaaaaaaa-0000-4000-8000-00000000000a', 'b1000000-0000-4000-8000-000000000001')$$, 'P0002', null, 'range of another tenant is not found');
select lives_ok($$update public.number_ranges set archived_at = now() where id = 'a1000000-0000-4000-8000-000000000001'$$, 'a non-default range can be archived');
select throws_ok($$select public.set_default_number_range('aaaaaaaa-0000-4000-8000-00000000000a', 'a1000000-0000-4000-8000-000000000001')$$, '22023', null, 'an archived range cannot become the default');
select throws_ok($$select public.set_default_number_range('bbbbbbbb-0000-4000-8000-00000000000b', 'b1000000-0000-4000-8000-000000000001')$$, '42501', null, 'member of A cannot change B');
select results_eq(
  $$select name from public.number_ranges where name like 'PGTAP%' order by name$$,
  $$values ('PGTAP Gutscheine'::text), ('PGTAP Rechnungen'::text)$$, 'member of A sees only the ranges of A');
select throws_ok($$insert into public.number_ranges (tenant_id, name, format) values ('bbbbbbbb-0000-4000-8000-00000000000b', 'Hack', 'H{N}')$$, '42501', null, 'member of A cannot insert into B');
select throws_ok($$delete from public.number_ranges$$, '42501', null, 'ranges cannot be deleted (archive instead)');

create temp table ids (label text, id uuid);
grant all on ids to authenticated;
insert into ids select 'tenant', public.create_tenant('PGTAP Neu');
insert into ids select 'invoice', public.save_invoice(
  'aaaaaaaa-0000-4000-8000-00000000000a', null,
  '{"number":"GU1/26","recipient":{"name":"X"},"issue_date":"2026-10-09","service_date_from":"2026-10-09","number_range_id":"a1000000-0000-4000-8000-000000000002"}',
  '[{"description":"Gutschein","quantity":1,"unit":"","unit_price_gross":60,"vat_rate":0}]'
);
select is((select number_range_id from public.invoices where id = (select id from ids where label = 'invoice')),
  'a1000000-0000-4000-8000-000000000002'::uuid, 'save_invoice stores the number range');
select throws_ok(
  $$select public.save_invoice('aaaaaaaa-0000-4000-8000-00000000000a', null,
    '{"number":"PGTAP09-B","recipient":{},"issue_date":"2026-10-09","service_date_from":"2026-10-09","number_range_id":"b1000000-0000-4000-8000-000000000001"}', '[]')$$,
  '23503', null, 'save_invoice rejects a range of another tenant');
reset role;

select results_eq(
  $$select name, format, is_default from public.number_ranges where tenant_id = (select id from ids where label = 'tenant')$$,
  $$values ('Rechnungen'::text, '{JJJJ}-{NNNN}'::text, true)$$, 'create_tenant adds the default range "Rechnungen"');

set local role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', true);
select throws_ok($$select public.set_default_number_range('aaaaaaaa-0000-4000-8000-00000000000a', 'a1000000-0000-4000-8000-000000000002')$$, '42501', null, 'anon cannot switch the default');
reset role;

select * from finish();
rollback;
