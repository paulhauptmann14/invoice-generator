begin;
create extension if not exists pgtap with schema extensions;
select plan(15);

select has_table('public', 'tenants', 'tenants exists');
select has_table('private', 'tenant_members', 'tenant_members exists (in the non-exposed schema)');
select hasnt_table('private', 'members', 'the global allow-list is gone');
select has_table('public', 'settings', 'settings exists');
select has_table('public', 'customers', 'customers exists');
select has_table('public', 'articles', 'articles exists');
select has_table('public', 'invoices', 'invoices exists');
select has_table('public', 'invoice_items', 'invoice_items exists');
select has_table('public', 'invoice_exports', 'invoice_exports exists');

select col_is_pk('public', 'settings', 'tenant_id', 'settings: one row per tenant');

insert into public.tenants (id, name) values ('aaaaaaaa-0000-4000-8000-00000000000a', 'PGTAP Betrieb A');

insert into public.invoices (tenant_id, number, recipient, issue_date, service_date_from, payment_days)
values ('aaaaaaaa-0000-4000-8000-00000000000a', 'PGTAP-T-1', '{"name":"X"}', '2026-10-07', '2026-10-07', 14);
select is((select due_date from public.invoices where number = 'PGTAP-T-1'), '2026-10-21'::date, 'due_date = issue_date + payment_days');
select throws_ok(
  $$insert into public.invoices (tenant_id, number, recipient, issue_date, service_date_from, payment_days) values ('aaaaaaaa-0000-4000-8000-00000000000a', 'PGTAP-T-1', '{}', '2026-10-07', '2026-10-07', 14)$$,
  '23505', null, 'invoice numbers are unique within a tenant'
);
select throws_ok(
  $$insert into public.invoices (tenant_id, number, recipient, issue_date, service_date_from, service_date_to, payment_days) values ('aaaaaaaa-0000-4000-8000-00000000000a', 'PGTAP-T-2', '{}', '2026-10-07', '2026-10-07', '2026-10-01', 14)$$,
  '23514', null, 'service period end must not be before its start'
);
select throws_ok(
  $$insert into public.invoices (tenant_id, number, recipient, issue_date, service_date_from, payment_days) values ('aaaaaaaa-0000-4000-8000-00000000000a', '   ', '{}', '2026-10-07', '2026-10-07', 14)$$,
  '23514', null, 'blank invoice number is rejected'
);
select throws_ok(
  $$insert into public.customers (name) values ('Ohne Betrieb')$$,
  '23502', null, 'rows without tenant are rejected'
);

select * from finish();
rollback;
