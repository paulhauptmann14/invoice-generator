begin;
create extension if not exists pgtap with schema extensions;
select plan(4);

insert into public.tenants (id, name) values ('aaaaaaaa-0000-4000-8000-00000000000a', 'PGTAP Betrieb A');

insert into public.customers (tenant_id, name, contact_person, city, email)
values ('aaaaaaaa-0000-4000-8000-00000000000a', 'Testkunde Search05', 'Max Muster', 'Beispielhausen', 'info@mueller.de');
insert into public.articles (tenant_id, name, description, unit, unit_price_gross, vat_rate)
values ('aaaaaaaa-0000-4000-8000-00000000000a', 'Testfilet Search05', 'vom Weiderind', 'kg', 54.90, 7);

select is((select search_text from public.customers where name = 'Testkunde Search05'),
  'testkunde search05 max muster beispielhausen info@mueller.de', 'customer search_text combines lower-cased fields');
select is((select search_text from public.articles where name = 'Testfilet Search05'),
  'testfilet search05 vom weiderind kg', 'article search_text combines lower-cased fields');
select throws_ok($$update public.customers set search_text = 'x'$$, '428C9', null, 'search_text is generated and read-only');
select has_column('public', 'articles', 'search_text', 'articles.search_text exists');

select * from finish();
rollback;
