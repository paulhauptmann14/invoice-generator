begin;
create extension if not exists pgtap with schema extensions;
select plan(6);

insert into auth.users (id, email) values ('11111111-1111-1111-1111-111111111111', 'member@test.local');
insert into private.members (user_id) values ('11111111-1111-1111-1111-111111111111');

create temp table ids (label text, id uuid);
grant all on ids to authenticated;

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}', true);

insert into ids select 'with-customer', public.save_invoice(
  null,
  '{"number":"PGTAP-06-1","customer_id":null,"save_as_customer":true,
    "recipient":{"name":"Neukunde PGTAP06","contactPerson":"Eva","street":"Weg 1","postalCode":"11111","city":"Ort","countryCode":"AT","vatId":"ATU12345678"},
    "issue_date":"2026-10-07","service_date_from":"2026-10-07","payment_days":14}',
  '[{"description":"Buffet","quantity":1,"unit":"","unit_price_gross":10,"vat_rate":7}]'
);
insert into ids select 'without-customer', public.save_invoice(
  null,
  '{"number":"PGTAP-06-2","customer_id":null,"recipient":{"name":"Laufkunde PGTAP06"},
    "issue_date":"2026-10-07","service_date_from":"2026-10-07","payment_days":14}',
  '[{"description":"Buffet","quantity":1,"unit":"","unit_price_gross":10,"vat_rate":7}]'
);

select is((select count(*)::int from public.customers where name = 'Neukunde PGTAP06'), 1, 'save_as_customer creates the customer');
select results_eq(
  $$select c.contact_person, c.country_code::text, c.vat_id from public.customers c where c.name = 'Neukunde PGTAP06'$$,
  $$values ('Eva'::text, 'AT'::text, 'ATU12345678'::text)$$,
  'customer copies the recipient fields'
);
select is(
  (select i.customer_id from public.invoices i where i.id = (select id from ids where label = 'with-customer')),
  (select c.id from public.customers c where c.name = 'Neukunde PGTAP06'),
  'invoice is linked to the new customer'
);
select is((select count(*)::int from public.customers where name = 'Laufkunde PGTAP06'), 0, 'no customer without the flag');
select is(
  (select search_text from public.invoices where number = 'PGTAP-06-2'),
  'pgtap-06-2 laufkunde pgtap06',
  'invoice search_text = number + recipient name, lower-cased'
);
reset role;
select throws_ok($$update public.invoices set search_text = 'x'$$, '428C9', null, 'search_text is generated');

select * from finish();
rollback;
