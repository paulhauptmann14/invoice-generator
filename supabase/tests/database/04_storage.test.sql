begin;
create extension if not exists pgtap with schema extensions;
select plan(8);

insert into auth.users (id, email) values
  ('11111111-1111-1111-1111-111111111111', 'member@test.local'),
  ('22222222-2222-2222-2222-222222222222', 'stranger@test.local');
insert into private.members (user_id) values ('11111111-1111-1111-1111-111111111111');

select is((select public from storage.buckets where id = 'assets'), false, 'assets bucket is private');
select is((select public from storage.buckets where id = 'invoice-pdfs'), false, 'invoice-pdfs bucket is private');
select is((select file_size_limit from storage.buckets where id = 'invoice-pdfs'), 10485760::bigint, 'PDF size limit is 10 MB');

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}', true);
select lives_ok($$insert into storage.objects (bucket_id, name) values ('invoice-pdfs', 'PGTAP-04/test.pdf')$$, 'member: upload allowed');
-- Only count the test's own object: the local bucket may already hold real archived PDFs.
select is((select count(*)::int from storage.objects where bucket_id = 'invoice-pdfs' and name = 'PGTAP-04/test.pdf'), 1, 'member: file visible');
reset role;

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}', true);
select is((select count(*)::int from storage.objects where bucket_id = 'invoice-pdfs'), 0, 'stranger: file invisible');
select throws_ok($$insert into storage.objects (bucket_id, name) values ('assets', 'x.png')$$, '42501', null, 'stranger: upload blocked');
reset role;

set local role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', true);
select is((select count(*)::int from storage.objects), 0, 'anon: nothing visible');
reset role;

select * from finish();
rollback;
