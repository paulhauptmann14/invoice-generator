begin;
create extension if not exists pgtap with schema extensions;
select plan(10);

insert into auth.users (id, email) values
  ('11111111-1111-4111-8111-111111111111', 'member@test.local'),
  ('22222222-2222-4222-8222-222222222222', 'stranger@test.local');
insert into public.tenants (id, name) values
  ('aaaaaaaa-0000-4000-8000-00000000000a', 'PGTAP Betrieb A'),
  ('bbbbbbbb-0000-4000-8000-00000000000b', 'PGTAP Betrieb B');
insert into private.tenant_members (tenant_id, user_id) values ('aaaaaaaa-0000-4000-8000-00000000000a', '11111111-1111-4111-8111-111111111111');

select is((select public from storage.buckets where id = 'assets'), false, 'assets bucket is private');
select is((select public from storage.buckets where id = 'invoice-pdfs'), false, 'invoice-pdfs bucket is private');
select is((select file_size_limit from storage.buckets where id = 'invoice-pdfs'), 10485760::bigint, 'PDF size limit is 10 MB');

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"11111111-1111-4111-8111-111111111111","role":"authenticated"}', true);
select lives_ok($$insert into storage.objects (bucket_id, name) values ('invoice-pdfs', 'aaaaaaaa-0000-4000-8000-00000000000a/PGTAP-04/test.pdf')$$, 'member: upload into own tenant folder allowed');
-- Only count the test's own object: the local bucket may already hold real archived PDFs.
select is((select count(*)::int from storage.objects where bucket_id = 'invoice-pdfs' and name = 'aaaaaaaa-0000-4000-8000-00000000000a/PGTAP-04/test.pdf'), 1, 'member: file visible');
select throws_ok($$insert into storage.objects (bucket_id, name) values ('invoice-pdfs', 'bbbbbbbb-0000-4000-8000-00000000000b/x.pdf')$$, '42501', null, 'member: upload into another tenant blocked');
select throws_ok($$insert into storage.objects (bucket_id, name) values ('assets', 'PGTAP-04/x.png')$$, '42501', null, 'member: path without tenant blocked');
reset role;

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"22222222-2222-4222-8222-222222222222","role":"authenticated"}', true);
select is((select count(*)::int from storage.objects where bucket_id = 'invoice-pdfs'), 0, 'stranger: file invisible');
select throws_ok($$insert into storage.objects (bucket_id, name) values ('assets', 'aaaaaaaa-0000-4000-8000-00000000000a/x.png')$$, '42501', null, 'stranger: upload blocked');
reset role;

set local role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', true);
select is((select count(*)::int from storage.objects), 0, 'anon: nothing visible');
reset role;

select * from finish();
rollback;
