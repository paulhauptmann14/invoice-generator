begin;
create extension if not exists pgtap with schema extensions;
select plan(11);

insert into auth.users (id, email) values
  ('11111111-1111-1111-1111-111111111111', 'member@test.local'),
  ('22222222-2222-2222-2222-222222222222', 'stranger@test.local');
insert into private.members (user_id) values ('11111111-1111-1111-1111-111111111111');

create temp table ids (id uuid);
grant all on ids to authenticated;

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}', true);

insert into ids
select public.save_invoice(
  null,
  '{"number":"2026-0001","customer_id":null,"recipient":{"name":"Müller"},"issue_date":"2026-10-07","service_date_from":"2026-10-07","service_date_to":null,"payment_days":14,"intro_text":"Hallo","closing_text":null}',
  '[{"description":"Buffet","quantity":2,"unit":"Pers.","unit_price_gross":24.90,"vat_rate":7},
    {"description":"Schorle","quantity":3,"unit":"Fl.","unit_price_gross":3.50,"vat_rate":19,"save_as_article":true}]'
);

select isnt((select id from ids), null, 'new invoice created');
select is((select count(*)::int from public.invoice_items where invoice_id = (select id from ids)), 2, 'two line items');
select results_eq(
  $$select position, description from public.invoice_items where invoice_id = (select id from ids) order by position$$,
  $$values (0, 'Buffet'), (1, 'Schorle')$$,
  'array order = position'
);
select is((select count(*)::int from public.articles where name = 'Schorle'), 1, 'save_as_article creates an article');
select isnt(
  (select article_id from public.invoice_items where description = 'Schorle'), null,
  'line item is linked to the new article'
);

select lives_ok(
  $$select public.save_invoice(
    (select id from ids),
    '{"number":"2026-0001","customer_id":null,"recipient":{"name":"Müller"},"issue_date":"2026-10-07","service_date_from":"2026-10-07","service_date_to":null,"payment_days":30,"intro_text":null,"closing_text":null}',
    '[{"description":"Nur noch eine","quantity":1,"unit":"","unit_price_gross":10,"vat_rate":7}]'
  )$$,
  'update succeeds'
);
select is((select count(*)::int from public.invoice_items where invoice_id = (select id from ids)), 1, 'update replaces line items');
select is((select due_date from public.invoices where id = (select id from ids)), '2026-11-06'::date, 'update applies the new payment terms');

select throws_ok(
  $$select public.save_invoice(null, '{"number":"2026-0001","recipient":{},"issue_date":"2026-10-07","service_date_from":"2026-10-07","payment_days":14}', '[]')$$,
  '23505', null, 'duplicate invoice number is rejected'
);
reset role;

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}', true);
select throws_ok(
  $$select public.save_invoice(null, '{"number":"X-1","recipient":{},"issue_date":"2026-10-07","service_date_from":"2026-10-07","payment_days":14}', '[]')$$,
  '42501', null, 'non-member cannot save'
);
reset role;

set local role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', true);
select throws_ok(
  $$select public.save_invoice(null, '{}', '[]')$$,
  '42501', null, 'anon cannot execute save_invoice'
);
reset role;

select * from finish();
rollback;
