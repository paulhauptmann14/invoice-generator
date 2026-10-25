begin;
create extension if not exists pgtap with schema extensions;
select plan(20);

insert into auth.users (id, email) values ('11111111-1111-4111-8111-111111111111', 'seq@test.local');
insert into public.tenants (id, name) values
  ('aaaaaaaa-0000-4000-8000-00000000000a', 'PGTAP Betrieb A'),
  ('bbbbbbbb-0000-4000-8000-00000000000b', 'PGTAP Betrieb B');
insert into private.tenant_members (tenant_id, user_id) values
  ('aaaaaaaa-0000-4000-8000-00000000000a', '11111111-1111-4111-8111-111111111111'),
  ('bbbbbbbb-0000-4000-8000-00000000000b', '11111111-1111-4111-8111-111111111111');
insert into public.customers (id, tenant_id, name) values
  ('c1000000-0000-4000-8000-000000000001', 'aaaaaaaa-0000-4000-8000-00000000000a', 'PGTAP Kunde 1'),
  ('c1000000-0000-4000-8000-000000000002', 'aaaaaaaa-0000-4000-8000-00000000000a', 'PGTAP Kunde 2'),
  ('c1000000-0000-4000-8000-000000000003', 'aaaaaaaa-0000-4000-8000-00000000000a', 'PGTAP Kunde 3');
insert into public.number_ranges (id, tenant_id, name, format, is_default) values
  ('a1000000-0000-4000-8000-000000000001', 'aaaaaaaa-0000-4000-8000-00000000000a', 'PGTAP Metzgerei', 'M{N}/{JJ}', true),
  ('a1000000-0000-4000-8000-000000000002', 'aaaaaaaa-0000-4000-8000-00000000000a', 'PGTAP Gasthaus', 'G{N}/{JJ}', false);

select has_column('public', 'invoices', 'customer_seq', 'invoices.customer_seq exists');
select throws_ok(
  $$insert into public.invoices (tenant_id, number, recipient, service_date_from, customer_seq)
    values ('aaaaaaaa-0000-4000-8000-00000000000a', 'PGTAP13-ZERO', '{}', '2026-10-25', 0)$$,
  '23514', null, 'a counter below 1 is rejected'
);

create temp table made (label text primary key, id uuid);
grant all on made to authenticated;

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"11111111-1111-4111-8111-111111111111","role":"authenticated"}', true);

-- Test helper: saves an invoice through the RPC (p_id null = new invoice) and returns its id.
create function pg_temp.mk(p_tenant uuid, p_number text, p_range uuid, p_customer uuid, p_name text, p_id uuid default null)
returns uuid language sql as $$
  select public.save_invoice(
    p_tenant, p_id,
    jsonb_build_object(
      'number', p_number, 'number_range_id', p_range, 'customer_id', p_customer,
      'recipient', jsonb_build_object('name', p_name),
      'issue_date', '2026-10-25', 'service_date_from', '2026-10-25', 'payment_days', 14),
    '[]'::jsonb)
$$;
create function pg_temp.seq(p_id uuid) returns int language sql as $$
  select customer_seq from public.invoices where id = p_id
$$;

insert into made select 'k1-m-1', pg_temp.mk('aaaaaaaa-0000-4000-8000-00000000000a', 'M1/26', 'a1000000-0000-4000-8000-000000000001', 'c1000000-0000-4000-8000-000000000001', 'PGTAP Kunde 1');
insert into made select 'k1-m-2', pg_temp.mk('aaaaaaaa-0000-4000-8000-00000000000a', 'M2/26', 'a1000000-0000-4000-8000-000000000001', 'c1000000-0000-4000-8000-000000000001', 'PGTAP Kunde 1');
insert into made select 'k2-m-1', pg_temp.mk('aaaaaaaa-0000-4000-8000-00000000000a', 'M3/26', 'a1000000-0000-4000-8000-000000000001', 'c1000000-0000-4000-8000-000000000002', 'PGTAP Kunde 2');
insert into made select 'k1-g-1', pg_temp.mk('aaaaaaaa-0000-4000-8000-00000000000a', 'G1/26', 'a1000000-0000-4000-8000-000000000002', 'c1000000-0000-4000-8000-000000000001', 'PGTAP Kunde 1');
insert into made select 'k1-none-1', pg_temp.mk('aaaaaaaa-0000-4000-8000-00000000000a', 'X1/26', null, 'c1000000-0000-4000-8000-000000000001', 'PGTAP Kunde 1');
insert into made select 'k1-none-2', pg_temp.mk('aaaaaaaa-0000-4000-8000-00000000000a', 'X2/26', null, 'c1000000-0000-4000-8000-000000000001', 'PGTAP Kunde 1');

select is(pg_temp.seq((select id from made where label = 'k1-m-1')), 1, 'first invoice of a customer in a range gets 1');
select is(pg_temp.seq((select id from made where label = 'k1-m-2')), 2, 'second invoice of the same customer in the same range gets 2');
select is(pg_temp.seq((select id from made where label = 'k2-m-1')), 1, 'another customer starts at 1');
select is(pg_temp.seq((select id from made where label = 'k1-g-1')), 1, 'the same customer in another range starts at 1');
select is(pg_temp.seq((select id from made where label = 'k1-none-1')), 1, 'an invoice without a range is its own group (first)');
select is(pg_temp.seq((select id from made where label = 'k1-none-2')), 2, 'an invoice without a range is its own group (second)');

-- Free-text recipients (no customer_id): grouped by name, ignoring case and whitespace.
insert into made select 'f-1', pg_temp.mk('aaaaaaaa-0000-4000-8000-00000000000a', 'M10/26', 'a1000000-0000-4000-8000-000000000001', null, 'PGTAP Hauptmann');
insert into made select 'f-2', pg_temp.mk('aaaaaaaa-0000-4000-8000-00000000000a', 'M11/26', 'a1000000-0000-4000-8000-000000000001', null, '  pgtap   HAUPTMANN ');
insert into made select 'f-3', pg_temp.mk('aaaaaaaa-0000-4000-8000-00000000000a', 'M12/26', 'a1000000-0000-4000-8000-000000000001', null, 'PGTAP Anders');
insert into made select 'f-same-name', pg_temp.mk('aaaaaaaa-0000-4000-8000-00000000000a', 'M13/26', 'a1000000-0000-4000-8000-000000000001', null, 'PGTAP Kunde 1');
select is(pg_temp.seq((select id from made where label = 'f-1')), 1, 'free-text recipient: first is 1');
select is(pg_temp.seq((select id from made where label = 'f-2')), 2, 'free-text recipient: same name (case and whitespace-insensitive) counts on');
select is(pg_temp.seq((select id from made where label = 'f-3')), 1, 'free-text recipient: another name starts at 1');
select is(pg_temp.seq((select id from made where label = 'f-same-name')), 1, 'a free-text name never counts invoices that have a customer_id');

-- Updates never change the value, not even when customer or range change.
select lives_ok(
  $$select pg_temp.mk('aaaaaaaa-0000-4000-8000-00000000000a', 'M11/26', 'a1000000-0000-4000-8000-000000000002', 'c1000000-0000-4000-8000-000000000002', 'PGTAP Kunde 2', (select id from made where label = 'f-2'))$$,
  'update with another customer and range succeeds'
);
select is(pg_temp.seq((select id from made where label = 'f-2')), 2, 'update keeps the value');

-- Deleting invoice 1 does not free its number: the next one is 3.
delete from public.invoices where id = (select id from made where label = 'k1-m-1');
insert into made select 'k1-m-3', pg_temp.mk('aaaaaaaa-0000-4000-8000-00000000000a', 'M4/26', 'a1000000-0000-4000-8000-000000000001', 'c1000000-0000-4000-8000-000000000001', 'PGTAP Kunde 1');
select is(pg_temp.seq((select id from made where label = 'k1-m-3')), 3, 'after deleting invoice 1 the next one is 3 (max + 1)');

-- Tenant isolation: the other tenant's invoices do not count.
insert into made select 'a-iso-1', pg_temp.mk('aaaaaaaa-0000-4000-8000-00000000000a', 'ISO1', null, null, 'PGTAP Isolde');
insert into made select 'b-iso-1', pg_temp.mk('bbbbbbbb-0000-4000-8000-00000000000b', 'ISO1', null, null, 'PGTAP Isolde');
insert into made select 'a-iso-2', pg_temp.mk('aaaaaaaa-0000-4000-8000-00000000000a', 'ISO2', null, null, 'PGTAP Isolde');
select is(pg_temp.seq((select id from made where label = 'b-iso-1')), 1, 'the same name in another tenant starts at 1');
select is(pg_temp.seq((select id from made where label = 'a-iso-2')), 2, 'the other tenant does not disturb the counter');

-- Backfill (as run by the migration): ordered by issue_date, created_at, id; only rows without a value.
reset role;
insert into public.invoices (id, tenant_id, number, number_range_id, customer_id, recipient, issue_date, service_date_from, created_at) values
  ('d0000000-0000-4000-8000-000000000001', 'aaaaaaaa-0000-4000-8000-00000000000a', 'BF-X', 'a1000000-0000-4000-8000-000000000002', 'c1000000-0000-4000-8000-000000000003', '{}', '2026-03-01', '2026-03-01', '2026-01-03'),
  ('d0000000-0000-4000-8000-000000000002', 'aaaaaaaa-0000-4000-8000-00000000000a', 'BF-Y', 'a1000000-0000-4000-8000-000000000002', 'c1000000-0000-4000-8000-000000000003', '{}', '2026-01-01', '2026-01-01', '2026-01-05'),
  ('d0000000-0000-4000-8000-000000000003', 'aaaaaaaa-0000-4000-8000-00000000000a', 'BF-Z', 'a1000000-0000-4000-8000-000000000002', 'c1000000-0000-4000-8000-000000000003', '{}', '2026-01-01', '2026-01-01', '2026-01-02'),
  ('d0000000-0000-4000-8000-000000000004', 'aaaaaaaa-0000-4000-8000-00000000000a', 'BF-N1', null, null, '{"name":"PGTAP Backfill"}', '2026-02-01', '2026-02-01', '2026-02-01'),
  ('d0000000-0000-4000-8000-000000000005', 'aaaaaaaa-0000-4000-8000-00000000000a', 'BF-N2', null, null, '{"name":" pgtap BACKFILL"}', '2026-01-15', '2026-01-15', '2026-02-02');
select private.backfill_customer_seq();
select results_eq(
  $$select number, customer_seq from public.invoices where number like 'BF-%' order by number$$,
  $$values ('BF-N1', 2), ('BF-N2', 1), ('BF-X', 3), ('BF-Y', 2), ('BF-Z', 1)$$,
  'backfill numbers each group by issue_date, created_at, id'
);
select is(
  (select customer_seq from public.invoices where number = 'M4/26'), 3,
  'backfill leaves invoices that already have a value alone'
);
select is((select count(*)::int from public.invoices where customer_seq is null), 0, 'no invoice is left without a value');

select * from finish();
rollback;
