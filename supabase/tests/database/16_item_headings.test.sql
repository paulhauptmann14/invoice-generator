begin;
create extension if not exists pgtap with schema extensions;
select plan(8);

select has_column('public', 'invoice_items', 'kind', 'invoice_items.kind exists');
select col_default_is('public', 'invoice_items', 'kind', 'item'::text, 'items are the default kind');

insert into auth.users (id, email) values ('11111111-1111-4111-8111-111111111111', 'heading@test.local');
insert into public.tenants (id, name) values ('aaaaaaaa-0000-4000-8000-00000000000a', 'PGTAP Betrieb A');
insert into private.tenant_members (tenant_id, user_id) values ('aaaaaaaa-0000-4000-8000-00000000000a', '11111111-1111-4111-8111-111111111111');
insert into public.invoices (id, tenant_id, number, recipient, issue_date, service_date_from)
values ('dddddddd-0000-4000-8000-000000000001', 'aaaaaaaa-0000-4000-8000-00000000000a', 'PGTAP-HEAD-1', '{}', '2026-11-12', '2026-11-12');

select throws_ok(
  $$insert into public.invoice_items (tenant_id, invoice_id, position, kind, description, quantity, unit_price_gross, vat_rate)
    values ('aaaaaaaa-0000-4000-8000-00000000000a', 'dddddddd-0000-4000-8000-000000000001', 0, 'heading', 'KW 41', null, 10, 7)$$,
  '23514', null, 'a heading with a price is rejected'
);
select throws_ok(
  $$insert into public.invoice_items (tenant_id, invoice_id, position, kind, description, quantity, unit_price_gross, vat_rate)
    values ('aaaaaaaa-0000-4000-8000-00000000000a', 'dddddddd-0000-4000-8000-000000000001', 0, 'item', 'Buffet', 1, null, null)$$,
  '23514', null, 'an item without price and VAT rate is rejected'
);
select throws_ok(
  $$insert into public.invoice_items (tenant_id, invoice_id, position, kind, description, unit_price_gross, vat_rate)
    values ('aaaaaaaa-0000-4000-8000-00000000000a', 'dddddddd-0000-4000-8000-000000000001', 0, 'note', 'x', 1, 7)$$,
  '23514', null, 'an unknown kind is rejected'
);

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"11111111-1111-4111-8111-111111111111","role":"authenticated"}', true);

-- save_invoice stores headings between items, ignores amounts sent with a heading and never makes them articles.
select lives_ok(
  $$select public.save_invoice(
    'aaaaaaaa-0000-4000-8000-00000000000a', null,
    '{"number":"PGTAP-HEAD-2","recipient":{"name":"Kunde"},"issue_date":"2026-11-12","service_date_from":"2026-11-12","payment_days":14}',
    '[{"kind":"heading","description":"KW 41","quantity":1,"unit":"Stk.","unit_price_gross":5,"vat_rate":7,"save_as_article":true},
      {"description":"Mittagessen","quantity":5,"unit":"Pers.","unit_price_gross":9.50,"vat_rate":7},
      {"kind":"heading","description":"KW 42"},
      {"description":"Mittagessen","quantity":4,"unit":"Pers.","unit_price_gross":9.50,"vat_rate":7}]')$$,
  'save_invoice accepts headings between items'
);
select is(
  (select string_agg(i.kind || ':' || i.description || ':' || coalesce(i.unit_price_gross::text, '-'), ' | ' order by i.position)
   from public.invoice_items i join public.invoices v on v.id = i.invoice_id where v.number = 'PGTAP-HEAD-2'),
  'heading:KW 41:- | item:Mittagessen:9.50 | heading:KW 42:- | item:Mittagessen:9.50',
  'headings keep their place and carry no amounts'
);
select is((select count(*)::int from public.articles where name = 'KW 41'), 0, 'a heading is never saved as an article');

select * from finish();
rollback;
