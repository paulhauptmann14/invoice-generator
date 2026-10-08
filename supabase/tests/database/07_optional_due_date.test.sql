begin;
create extension if not exists pgtap with schema extensions;
select plan(6);

-- Payment terms are optional: no payment days means no due date on the invoice.
insert into public.tenants (id, name) values ('aaaaaaaa-0000-4000-8000-00000000000a', 'PGTAP Betrieb A');

select col_is_null('public', 'invoices', 'payment_days', 'invoices.payment_days is optional');
select col_is_null('public', 'settings', 'default_payment_days', 'settings.default_payment_days is optional');

insert into public.invoices (tenant_id, number, recipient, issue_date, service_date_from)
values ('aaaaaaaa-0000-4000-8000-00000000000a', 'PGTAP-DUE-1', '{}', '2026-10-07', '2026-10-07');
select is((select due_date from public.invoices where number = 'PGTAP-DUE-1'), null, 'no payment days -> no due date');

insert into auth.users (id, email) values ('11111111-1111-1111-1111-111111111111', 'member@test.local');
insert into private.tenant_members (tenant_id, user_id) values ('aaaaaaaa-0000-4000-8000-00000000000a', '11111111-1111-1111-1111-111111111111');
create temp table ids (id uuid);
grant all on ids to authenticated;

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}', true);
insert into ids
select public.save_invoice(
  'aaaaaaaa-0000-4000-8000-00000000000a',
  null,
  '{"number":"PGTAP-DUE-2","customer_id":null,"recipient":{"name":"Bar"},"issue_date":"2026-10-07","service_date_from":"2026-10-07","service_date_to":null,"payment_days":null,"intro_text":null,"closing_text":null}',
  '[{"description":"Essen","quantity":1,"unit":"","unit_price_gross":10,"vat_rate":7}]'
);
select is((select payment_days from public.invoices where id = (select id from ids)), null, 'save_invoice stores missing payment days as null');
select is((select due_date from public.invoices where id = (select id from ids)), null, 'save_invoice: no due date');

select lives_ok(
  $$select public.save_invoice('aaaaaaaa-0000-4000-8000-00000000000a', (select id from ids),
    '{"number":"PGTAP-DUE-2","customer_id":null,"recipient":{"name":"Bar"},"issue_date":"2026-10-07","service_date_from":"2026-10-07","service_date_to":null,"payment_days":14,"intro_text":null,"closing_text":null}',
    '[{"description":"Essen","quantity":1,"unit":"","unit_price_gross":10,"vat_rate":7}]')$$,
  'payment days can be added later'
);
reset role;

select * from finish();
rollback;
