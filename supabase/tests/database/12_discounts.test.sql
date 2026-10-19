begin;
create extension if not exists pgtap with schema extensions;
select plan(26);

-- Discount columns and constraints on invoices and invoice items.
select has_column('public', 'invoice_items', 'discount_kind', 'invoice_items.discount_kind exists');
select has_column('public', 'invoice_items', 'discount_value', 'invoice_items.discount_value exists');
select has_column('public', 'invoices', 'discount_kind', 'invoices.discount_kind exists');
select has_column('public', 'invoices', 'discount_value', 'invoices.discount_value exists');

insert into public.tenants (id, name) values ('aaaaaaaa-0000-4000-8000-00000000000d', 'PGTAP Betrieb D');
insert into public.invoices (id, tenant_id, number, recipient, issue_date, service_date_from)
values ('dddddddd-0000-4000-8000-000000000001', 'aaaaaaaa-0000-4000-8000-00000000000d', 'PGTAP-DISC-1', '{}', '2026-10-19', '2026-10-19');

-- Items: quantity 2 x 12.50 = 25.00 line amount.
select lives_ok(
  $$insert into public.invoice_items (tenant_id, invoice_id, position, description, quantity, unit_price_gross, vat_rate, discount_kind, discount_value)
    values ('aaaaaaaa-0000-4000-8000-00000000000d', 'dddddddd-0000-4000-8000-000000000001', 0, 'A', 2, 12.50, 19, 'percent', 10)$$,
  'item: percent 10 is accepted'
);
select throws_ok(
  $$insert into public.invoice_items (tenant_id, invoice_id, position, description, quantity, unit_price_gross, vat_rate, discount_kind, discount_value)
    values ('aaaaaaaa-0000-4000-8000-00000000000d', 'dddddddd-0000-4000-8000-000000000001', 1, 'A', 2, 12.50, 19, 'percent', 0)$$,
  '23514', null, 'item: percent 0 is rejected'
);
select throws_ok(
  $$insert into public.invoice_items (tenant_id, invoice_id, position, description, quantity, unit_price_gross, vat_rate, discount_kind, discount_value)
    values ('aaaaaaaa-0000-4000-8000-00000000000d', 'dddddddd-0000-4000-8000-000000000001', 1, 'A', 2, 12.50, 19, 'percent', 100.01)$$,
  '23514', null, 'item: percent above 100 is rejected'
);
select lives_ok(
  $$insert into public.invoice_items (tenant_id, invoice_id, position, description, quantity, unit_price_gross, vat_rate, discount_kind, discount_value)
    values ('aaaaaaaa-0000-4000-8000-00000000000d', 'dddddddd-0000-4000-8000-000000000001', 1, 'A', 2, 12.50, 19, 'percent', 100)$$,
  'item: percent 100 is accepted'
);
select throws_ok(
  $$insert into public.invoice_items (tenant_id, invoice_id, position, description, quantity, unit_price_gross, vat_rate, discount_kind)
    values ('aaaaaaaa-0000-4000-8000-00000000000d', 'dddddddd-0000-4000-8000-000000000001', 2, 'A', 2, 12.50, 19, 'percent')$$,
  '23514', null, 'item: kind without value is rejected'
);
select throws_ok(
  $$insert into public.invoice_items (tenant_id, invoice_id, position, description, quantity, unit_price_gross, vat_rate, discount_value)
    values ('aaaaaaaa-0000-4000-8000-00000000000d', 'dddddddd-0000-4000-8000-000000000001', 2, 'A', 2, 12.50, 19, 10)$$,
  '23514', null, 'item: value without kind is rejected'
);
select throws_ok(
  $$insert into public.invoice_items (tenant_id, invoice_id, position, description, quantity, unit_price_gross, vat_rate, discount_kind, discount_value)
    values ('aaaaaaaa-0000-4000-8000-00000000000d', 'dddddddd-0000-4000-8000-000000000001', 2, 'A', 2, 12.50, 19, 'x', 10)$$,
  '23514', null, 'item: unknown kind is rejected'
);
select lives_ok(
  $$insert into public.invoice_items (tenant_id, invoice_id, position, description, quantity, unit_price_gross, vat_rate, discount_kind, discount_value)
    values ('aaaaaaaa-0000-4000-8000-00000000000d', 'dddddddd-0000-4000-8000-000000000001', 2, 'A', 2, 12.50, 19, 'amount', 25.00)$$,
  'item: amount equal to the line amount is accepted'
);
select throws_ok(
  $$insert into public.invoice_items (tenant_id, invoice_id, position, description, quantity, unit_price_gross, vat_rate, discount_kind, discount_value)
    values ('aaaaaaaa-0000-4000-8000-00000000000d', 'dddddddd-0000-4000-8000-000000000001', 3, 'A', 2, 12.50, 19, 'amount', 25.01)$$,
  '23514', null, 'item: amount above the line amount is rejected'
);

-- Invoices.
select lives_ok(
  $$update public.invoices set discount_kind = 'percent', discount_value = 5 where id = 'dddddddd-0000-4000-8000-000000000001'$$,
  'invoice: percent 5 is accepted'
);
select lives_ok(
  $$update public.invoices set discount_kind = 'amount', discount_value = 30.41 where id = 'dddddddd-0000-4000-8000-000000000001'$$,
  'invoice: amount 30.41 is accepted'
);
select throws_ok(
  $$update public.invoices set discount_kind = 'amount', discount_value = 0 where id = 'dddddddd-0000-4000-8000-000000000001'$$,
  '23514', null, 'invoice: amount 0 is rejected'
);
select throws_ok(
  $$update public.invoices set discount_kind = 'percent', discount_value = 0 where id = 'dddddddd-0000-4000-8000-000000000001'$$,
  '23514', null, 'invoice: percent 0 is rejected'
);
select throws_ok(
  $$update public.invoices set discount_kind = 'percent', discount_value = 100.01 where id = 'dddddddd-0000-4000-8000-000000000001'$$,
  '23514', null, 'invoice: percent 100.01 is rejected'
);
select throws_ok(
  $$update public.invoices set discount_kind = 'percent', discount_value = null where id = 'dddddddd-0000-4000-8000-000000000001'$$,
  '23514', null, 'invoice: kind without value is rejected'
);
select throws_ok(
  $$update public.invoices set discount_kind = null, discount_value = 10 where id = 'dddddddd-0000-4000-8000-000000000001'$$,
  '23514', null, 'invoice: value without kind is rejected'
);
select throws_ok(
  $$update public.invoices set discount_kind = 'x', discount_value = 10 where id = 'dddddddd-0000-4000-8000-000000000001'$$,
  '23514', null, 'invoice: unknown kind is rejected'
);

-- save_invoice stores and clears the discounts.
insert into auth.users (id, email) values ('11111111-1111-1111-1111-111111111111', 'member@test.local');
insert into private.tenant_members (tenant_id, user_id) values ('aaaaaaaa-0000-4000-8000-00000000000d', '11111111-1111-1111-1111-111111111111');
create temp table ids (id uuid);
grant all on ids to authenticated;

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}', true);
insert into ids
select public.save_invoice(
  'aaaaaaaa-0000-4000-8000-00000000000d',
  null,
  '{"number":"PGTAP-DISC-2","customer_id":null,"recipient":{"name":"Foo"},"issue_date":"2026-10-19","service_date_from":"2026-10-19","payment_days":null,"intro_text":null,"closing_text":null,"discount_kind":"amount","discount_value":"30.41"}',
  '[{"description":"Essen","quantity":1,"unit":"","unit_price_gross":100,"vat_rate":7,"discount_kind":"percent","discount_value":"10"}]'
);
select is(
  (select (discount_kind, discount_value)::text from public.invoices where id = (select id from ids)),
  '(amount,30.41)', 'save_invoice stores the invoice discount'
);
select is(
  (select (discount_kind, discount_value)::text from public.invoice_items where invoice_id = (select id from ids)),
  '(percent,10.00)', 'save_invoice stores the item discount'
);

select public.save_invoice(
  'aaaaaaaa-0000-4000-8000-00000000000d',
  (select id from ids),
  '{"number":"PGTAP-DISC-2","customer_id":null,"recipient":{"name":"Foo"},"issue_date":"2026-10-19","service_date_from":"2026-10-19","payment_days":null,"intro_text":null,"closing_text":null,"discount_kind":"","discount_value":""}',
  '[{"description":"Essen","quantity":1,"unit":"","unit_price_gross":100,"vat_rate":7}]'
);
select is(
  (select (discount_kind is null and discount_value is null) from public.invoices where id = (select id from ids)),
  true, 'save_invoice without discount keys clears the invoice discount'
);
select is(
  (select (discount_kind is null and discount_value is null) from public.invoice_items where invoice_id = (select id from ids)),
  true, 'save_invoice without discount keys clears the item discount'
);

select public.save_invoice(
  'aaaaaaaa-0000-4000-8000-00000000000d',
  (select id from ids),
  '{"number":"PGTAP-DISC-2","customer_id":null,"recipient":{"name":"Foo"},"issue_date":"2026-10-19","service_date_from":"2026-10-19","payment_days":null,"intro_text":null,"closing_text":null,"discount_kind":null,"discount_value":null}',
  '[{"description":"Essen","quantity":1,"unit":"","unit_price_gross":100,"vat_rate":7,"discount_kind":null,"discount_value":null}]'
);
select is(
  (select count(*)::int from public.invoice_items where invoice_id = (select id from ids) and discount_kind is null),
  1, 'save_invoice accepts explicit null discounts'
);
reset role;

select * from finish();
rollback;
