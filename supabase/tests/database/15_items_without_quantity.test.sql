begin;
create extension if not exists pgtap with schema extensions;
select plan(9);

select col_is_null('public', 'invoice_items', 'quantity', 'invoice_items.quantity is optional');
select has_column('public', 'articles', 'without_quantity', 'articles.without_quantity exists');
select col_not_null('public', 'articles', 'without_quantity', 'articles.without_quantity is not null');
select col_default_is('public', 'articles', 'without_quantity', 'false', 'articles start with a quantity');

insert into auth.users (id, email) values ('11111111-1111-4111-8111-111111111111', 'noqty@test.local');
insert into public.tenants (id, name) values ('aaaaaaaa-0000-4000-8000-00000000000a', 'PGTAP Betrieb A');
insert into private.tenant_members (tenant_id, user_id) values ('aaaaaaaa-0000-4000-8000-00000000000a', '11111111-1111-4111-8111-111111111111');
insert into public.invoices (id, tenant_id, number, recipient, issue_date, service_date_from)
values ('dddddddd-0000-4000-8000-000000000001', 'aaaaaaaa-0000-4000-8000-00000000000a', 'PGTAP-NOQTY-1', '{}', '2026-11-12', '2026-11-12');

-- Without a quantity, an amount discount is limited by the price.
select lives_ok(
  $$insert into public.invoice_items (tenant_id, invoice_id, position, description, quantity, unit_price_gross, vat_rate, discount_kind, discount_value)
    values ('aaaaaaaa-0000-4000-8000-00000000000a', 'dddddddd-0000-4000-8000-000000000001', 0, 'lt. Tagesabrechnung', null, 120.00, 7, 'amount', 120.00)$$,
  'item without quantity: amount discount up to the price is accepted'
);
select throws_ok(
  $$insert into public.invoice_items (tenant_id, invoice_id, position, description, quantity, unit_price_gross, vat_rate, discount_kind, discount_value)
    values ('aaaaaaaa-0000-4000-8000-00000000000a', 'dddddddd-0000-4000-8000-000000000001', 1, 'lt. Tagesabrechnung', null, 120.00, 7, 'amount', 120.01)$$,
  '23514', null, 'item without quantity: amount discount above the price is rejected'
);

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"11111111-1111-4111-8111-111111111111","role":"authenticated"}', true);

-- save_invoice keeps a missing quantity and saves such a line as an article without quantity.
select lives_ok(
  $$select public.save_invoice(
    'aaaaaaaa-0000-4000-8000-00000000000a', null,
    '{"number":"PGTAP-NOQTY-2","recipient":{"name":"Kunde"},"issue_date":"2026-11-12","service_date_from":"2026-11-12","payment_days":14}',
    '[{"description":"PGTAP lt. Tagesabrechnung Metzgerei","quantity":null,"unit":"","unit_price_gross":312.40,"vat_rate":7,"save_as_article":true},
      {"description":"PGTAP Schorle","quantity":3,"unit":"Fl.","unit_price_gross":3.50,"vat_rate":19,"save_as_article":true}]')$$,
  'save_invoice accepts an item without quantity'
);
select is(
  (select array_agg(i.quantity order by i.position)::text from public.invoice_items i join public.invoices v on v.id = i.invoice_id where v.number = 'PGTAP-NOQTY-2'),
  '{NULL,3.000}', 'the item without quantity is stored with quantity null'
);
select is(
  (select array_agg(a.without_quantity order by a.name)::text from public.articles a where a.name like 'PGTAP %'),
  '{t,f}', 'an article saved from a line without quantity starts without quantity'
);

select * from finish();
rollback;
