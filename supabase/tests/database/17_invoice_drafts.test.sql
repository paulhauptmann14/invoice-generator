begin;
create extension if not exists pgtap with schema extensions;
select plan(9);

select col_is_null('public', 'invoices', 'number', 'invoices.number is optional (draft)');

insert into auth.users (id, email) values ('11111111-1111-4111-8111-111111111111', 'draft@test.local');
insert into public.tenants (id, name) values ('aaaaaaaa-0000-4000-8000-00000000000a', 'PGTAP Betrieb A');
insert into private.tenant_members (tenant_id, user_id) values ('aaaaaaaa-0000-4000-8000-00000000000a', '11111111-1111-4111-8111-111111111111');

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"11111111-1111-4111-8111-111111111111","role":"authenticated"}', true);

create temp table made (label text primary key, id uuid);

-- Several drafts at once: no number, no clash.
insert into made select 'd1', public.save_invoice(
  'aaaaaaaa-0000-4000-8000-00000000000a', null,
  '{"number":null,"recipient":{"name":"PGTAP Kantine Süd"},"issue_date":"2026-11-03","service_date_from":"2026-11-03","payment_days":14}',
  '[{"description":"Mittagessen","quantity":5,"unit":"","unit_price_gross":9.50,"vat_rate":7}]');
insert into made select 'd2', public.save_invoice(
  'aaaaaaaa-0000-4000-8000-00000000000a', null,
  '{"recipient":{"name":"PGTAP Kantine Nord"},"issue_date":"2026-11-04","service_date_from":"2026-11-04","payment_days":14}',
  '[{"description":"Mittagessen","quantity":4,"unit":"","unit_price_gross":9.50,"vat_rate":7}]');
select is(
  (select count(*)::int from public.invoices where id in (select id from made) and number is null),
  2, 'two drafts without a number are saved'
);
select is(
  (select count(*)::int from public.invoices where id in (select id from made) and search_text like '%kantine%'),
  2, 'drafts are found by their recipient'
);

-- Saving a draft again keeps it a draft.
select lives_ok(
  $$select public.save_invoice('aaaaaaaa-0000-4000-8000-00000000000a', (select id from made where label = 'd1'),
    '{"number":null,"recipient":{"name":"PGTAP Kantine Süd"},"issue_date":"2026-11-03","service_date_from":"2026-11-03","payment_days":14}',
    '[{"description":"Mittagessen","quantity":6,"unit":"","unit_price_gross":9.50,"vat_rate":7}]')$$,
  'a draft can be saved again without a number'
);

-- Giving the number (and the issue date) later.
select lives_ok(
  $$update public.invoices set number = 'PGTAP-D-1', issue_date = '2026-11-30' where id = (select id from made where label = 'd1') and number is null$$,
  'a draft gets its number later'
);
select is((select search_text from public.invoices where id = (select id from made where label = 'd1')), 'pgtap-d-1 pgtap kantine süd', 'the number is searchable then');
select throws_ok(
  $$update public.invoices set number = 'PGTAP-D-1' where id = (select id from made where label = 'd2')$$,
  '23505', null, 'a number still exists only once per business'
);

-- Once numbered, never a draft again: neither directly nor through save_invoice.
select throws_ok(
  $$update public.invoices set number = null where id = (select id from made where label = 'd1')$$,
  '23514', 'the number of an invoice cannot be removed', 'a number cannot be taken away'
);
select throws_ok(
  $$select public.save_invoice('aaaaaaaa-0000-4000-8000-00000000000a', (select id from made where label = 'd1'),
    '{"number":null,"recipient":{"name":"PGTAP Kantine Süd"},"issue_date":"2026-11-30","service_date_from":"2026-11-03","payment_days":14}',
    '[{"description":"Mittagessen","quantity":6,"unit":"","unit_price_gross":9.50,"vat_rate":7}]')$$,
  '23514', 'the number of an invoice cannot be removed', 'save_invoice cannot take the number away either'
);

select * from finish();
rollback;
