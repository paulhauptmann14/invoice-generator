begin;
create extension if not exists pgtap with schema extensions;
select plan(13);

select has_table('private', 'members', 'members exists (in the non-exposed schema)');
select has_table('public', 'settings', 'settings exists');
select has_table('public', 'customers', 'customers exists');
select has_table('public', 'articles', 'articles exists');
select has_table('public', 'invoices', 'invoices exists');
select has_table('public', 'invoice_items', 'invoice_items exists');
select has_table('public', 'invoice_exports', 'invoice_exports exists');

select is((select count(*)::int from public.settings), 1, 'settings has exactly one row');
select throws_ok($$insert into public.settings (id) values (2)$$, '23514', null, 'only id = 1 is allowed in settings');

insert into public.invoices (number, recipient, issue_date, service_date_from, payment_days)
values ('T-1', '{"name":"X"}', '2026-10-07', '2026-10-07', 14);
select is((select due_date from public.invoices where number = 'T-1'), '2026-10-21'::date, 'due_date = issue_date + payment_days');
select throws_ok(
  $$insert into public.invoices (number, recipient, issue_date, service_date_from, payment_days) values ('T-1', '{}', '2026-10-07', '2026-10-07', 14)$$,
  '23505', null, 'invoice numbers are unique'
);
select throws_ok(
  $$insert into public.invoices (number, recipient, issue_date, service_date_from, service_date_to, payment_days) values ('T-2', '{}', '2026-10-07', '2026-10-07', '2026-10-01', 14)$$,
  '23514', null, 'service period end must not be before its start'
);
select throws_ok(
  $$insert into public.invoices (number, recipient, issue_date, service_date_from, payment_days) values ('   ', '{}', '2026-10-07', '2026-10-07', 14)$$,
  '23514', null, 'blank invoice number is rejected'
);

select * from finish();
rollback;
