begin;
create extension if not exists pgtap with schema extensions;
select plan(31);

insert into auth.users (id, email) values
  ('11111111-1111-4111-8111-111111111111', 'seqm@test.local'),
  ('22222222-2222-4222-8222-222222222222', 'seqm-only-a@test.local');
insert into public.tenants (id, name) values
  ('aaaaaaaa-0000-4000-8000-00000000000a', 'PGTAP Betrieb A'),
  ('bbbbbbbb-0000-4000-8000-00000000000b', 'PGTAP Betrieb B');
insert into private.tenant_members (tenant_id, user_id) values
  ('aaaaaaaa-0000-4000-8000-00000000000a', '11111111-1111-4111-8111-111111111111'),
  ('bbbbbbbb-0000-4000-8000-00000000000b', '11111111-1111-4111-8111-111111111111'),
  ('aaaaaaaa-0000-4000-8000-00000000000a', '22222222-2222-4222-8222-222222222222');
insert into public.number_ranges (id, tenant_id, name, format, is_default) values
  ('a1000000-0000-4000-8000-000000000001', 'aaaaaaaa-0000-4000-8000-00000000000a', 'PGTAP Metzgerei', 'M{N}/{JJ}', true);

-- Grants: the table is closed to every API role, the helper is executable for members only.
select is(
  (select count(*)::int from information_schema.role_table_grants
   where table_schema = 'private' and table_name = 'customer_counters' and grantee in ('anon', 'authenticated', 'public')),
  0, 'no API role has table privileges on private.customer_counters'
);
select ok((select relrowsecurity from pg_class where oid = 'private.customer_counters'::regclass), 'customer_counters has RLS enabled');
select ok(has_function_privilege('authenticated', 'public.save_invoice(uuid, uuid, jsonb, jsonb)', 'execute'), 'authenticated can execute save_invoice');
select ok(not has_function_privilege('anon', 'public.save_invoice(uuid, uuid, jsonb, jsonb)', 'execute'), 'anon cannot execute save_invoice');
select ok(has_function_privilege('authenticated', 'private.claim_customer_seq(uuid, uuid, text, int)', 'execute'), 'authenticated can execute claim_customer_seq');
select ok(not has_function_privilege('anon', 'private.claim_customer_seq(uuid, uuid, text, int)', 'execute'), 'anon cannot execute claim_customer_seq');
select is((select p.prosecdef from pg_proc p where p.oid = 'public.save_invoice(uuid, uuid, jsonb, jsonb)'::regprocedure), false, 'save_invoice stays security invoker');

create temp table made (label text primary key, id uuid);
grant all on made to authenticated;

-- Reads the mark as the table owner (created before switching roles, so it runs with the owner's rights).
create function pg_temp.mark(p_tenant uuid, p_key text) returns int language sql security definer as $$
  select last_seq from private.customer_counters where tenant_id = p_tenant and customer_key = p_key
$$;

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"11111111-1111-4111-8111-111111111111","role":"authenticated"}', true);

-- Saves an invoice through the RPC (p_id null = new). p_seq null = key absent from the payload.
create function pg_temp.mk(p_tenant uuid, p_number text, p_name text, p_seq int default null, p_id uuid default null, p_range uuid default 'a1000000-0000-4000-8000-000000000001')
returns uuid language sql as $$
  select public.save_invoice(
    p_tenant, p_id,
    jsonb_build_object(
      'number', p_number, 'number_range_id', p_range, 'customer_id', null,
      'recipient', jsonb_build_object('name', p_name),
      'issue_date', '2026-10-25', 'service_date_from', '2026-10-25', 'payment_days', 14)
    || case when p_seq is null then '{}'::jsonb else jsonb_build_object('customer_seq', p_seq) end,
    '[]'::jsonb)
$$;
create function pg_temp.seq(p_id uuid) returns int language sql as $$
  select customer_seq from public.invoices where id = p_id
$$;

-- 1) Manual value on insert, the next automatic one continues after it.
insert into made select 'a-1', pg_temp.mk('aaaaaaaa-0000-4000-8000-00000000000a', 'N1', 'PGTAP Alpha', 5);
insert into made select 'a-2', pg_temp.mk('aaaaaaaa-0000-4000-8000-00000000000a', 'N2', 'PGTAP Alpha');
select is(pg_temp.seq((select id from made where label = 'a-1')), 5, 'insert with manual value 5 uses 5');
select is(pg_temp.seq((select id from made where label = 'a-2')), 6, 'the next automatic insert continues with 6');

-- 2) Update: a given value replaces the stored one, none keeps it.
select lives_ok($$select pg_temp.mk('aaaaaaaa-0000-4000-8000-00000000000a', 'N1', 'PGTAP Alpha', 9, (select id from made where label = 'a-1'))$$, 'update with value 9 succeeds');
select is(pg_temp.seq((select id from made where label = 'a-1')), 9, 'update with value 9 sets 9');
select lives_ok($$select pg_temp.mk('aaaaaaaa-0000-4000-8000-00000000000a', 'N1', 'PGTAP Alpha', null, (select id from made where label = 'a-1'))$$, 'update without value succeeds');
select is(pg_temp.seq((select id from made where label = 'a-1')), 9, 'update without value keeps the stored value');
select lives_ok($$select public.save_invoice('aaaaaaaa-0000-4000-8000-00000000000a', (select id from made where label = 'a-1'),
  '{"number":"N1","number_range_id":"a1000000-0000-4000-8000-000000000001","recipient":{"name":"PGTAP Alpha"},"issue_date":"2026-10-25","service_date_from":"2026-10-25","payment_days":14,"customer_seq":null}'::jsonb, '[]'::jsonb)$$, 'update with an explicit null succeeds');
select is(pg_temp.seq((select id from made where label = 'a-1')), 9, 'update with an explicit null keeps the stored value');
insert into made select 'a-3', pg_temp.mk('aaaaaaaa-0000-4000-8000-00000000000a', 'N3', 'PGTAP Alpha');
select is(pg_temp.seq((select id from made where label = 'a-3')), 10, 'after a manual 9 the automatic value is 10');

-- 3) A deleted newest invoice does not hand out its number again.
insert into made select 'b-1', pg_temp.mk('aaaaaaaa-0000-4000-8000-00000000000a', 'N10', 'PGTAP Beta');
insert into made select 'b-2', pg_temp.mk('aaaaaaaa-0000-4000-8000-00000000000a', 'N11', 'PGTAP Beta');
insert into made select 'b-3', pg_temp.mk('aaaaaaaa-0000-4000-8000-00000000000a', 'N12', 'PGTAP Beta');
delete from public.invoices where id = (select id from made where label = 'b-3');
insert into made select 'b-4', pg_temp.mk('aaaaaaaa-0000-4000-8000-00000000000a', 'N13', 'PGTAP Beta');
select is(pg_temp.seq((select id from made where label = 'b-4')), 4, 'after deleting the newest invoice (3) the next one is 4, not 3');

-- 4) A manual value below the mark does not lower it.
insert into made select 'c-1', pg_temp.mk('aaaaaaaa-0000-4000-8000-00000000000a', 'N20', 'PGTAP Gamma', 9);
insert into made select 'c-2', pg_temp.mk('aaaaaaaa-0000-4000-8000-00000000000a', 'N21', 'PGTAP Gamma', 3);
select is(pg_temp.seq((select id from made where label = 'c-2')), 3, 'a lower manual value (3) is accepted as given');
select is(pg_temp.mark('aaaaaaaa-0000-4000-8000-00000000000a', 'n:pgtap gamma'), 9, 'the mark stays at 9');
delete from public.invoices where id in (select id from made where label in ('c-1', 'c-2'));
insert into made select 'c-3', pg_temp.mk('aaaaaaaa-0000-4000-8000-00000000000a', 'N22', 'PGTAP Gamma');
select is(pg_temp.seq((select id from made where label = 'c-3')), 10, 'even with both invoices deleted the next value is 10');

-- 5) Tenant isolation: a manual value in tenant B does not affect tenant A (and vice versa).
insert into made select 'iso-b', pg_temp.mk('bbbbbbbb-0000-4000-8000-00000000000b', 'ISO1', 'PGTAP Isolde', 50, null, null);
insert into made select 'iso-a', pg_temp.mk('aaaaaaaa-0000-4000-8000-00000000000a', 'ISO1', 'PGTAP Isolde', null, null, null);
insert into made select 'iso-b2', pg_temp.mk('bbbbbbbb-0000-4000-8000-00000000000b', 'ISO2', 'PGTAP Isolde', null, null, null);
select is(pg_temp.seq((select id from made where label = 'iso-a')), 1, 'tenant A starts at 1 despite a manual 50 in tenant B');
select is(pg_temp.seq((select id from made where label = 'iso-b2')), 51, 'tenant B continues after its own manual 50');
select is(pg_temp.mark('aaaaaaaa-0000-4000-8000-00000000000a', 'n:pgtap isolde'), 1, 'the mark of tenant A is separate');
select is(pg_temp.mark('bbbbbbbb-0000-4000-8000-00000000000b', 'n:pgtap isolde'), 51, 'the mark of tenant B is separate');

-- 6) Groups without a range have their own mark (nil uuid), separate from groups with one.
insert into made select 'nr-1', pg_temp.mk('aaaaaaaa-0000-4000-8000-00000000000a', 'NR1', 'PGTAP Alpha', null, null, null);
select is(pg_temp.seq((select id from made where label = 'nr-1')), 1, 'the same name without a number range is its own group');

-- 7) Rejected values and access.
select throws_ok($$select pg_temp.mk('aaaaaaaa-0000-4000-8000-00000000000a', 'BAD0', 'PGTAP Delta', 0)$$, '22023', null, 'manual 0 is rejected');
select throws_ok($$select pg_temp.mk('aaaaaaaa-0000-4000-8000-00000000000a', 'BAD1', 'PGTAP Delta', 100000)$$, '22023', null, 'manual 100000 is rejected');
select throws_ok($$select * from private.customer_counters$$, '42501', null, 'members cannot read the counter table directly');

select set_config('request.jwt.claims', '{"sub":"22222222-2222-4222-8222-222222222222","role":"authenticated"}', true);
select throws_ok(
  $$select private.claim_customer_seq('bbbbbbbb-0000-4000-8000-00000000000b', null, 'n:x', 1)$$,
  '42501', null, 'a user without membership cannot claim a counter in another tenant'
);
select throws_ok(
  $$select pg_temp.mk('bbbbbbbb-0000-4000-8000-00000000000b', 'FORBIDDEN', 'PGTAP Delta', 7)$$,
  '42501', null, 'save_invoice with a counter in a foreign tenant is denied'
);

-- 8) The mark falls back to the stored maximum (rows that predate the mark table).
reset role;
insert into public.invoices (tenant_id, number, number_range_id, recipient, service_date_from, customer_seq)
  values ('aaaaaaaa-0000-4000-8000-00000000000a', 'OLD1', 'a1000000-0000-4000-8000-000000000001', '{"name":"PGTAP Olga"}', '2026-10-25', 7);
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"11111111-1111-4111-8111-111111111111","role":"authenticated"}', true);
insert into made select 'olga', pg_temp.mk('aaaaaaaa-0000-4000-8000-00000000000a', 'OLD2', 'PGTAP Olga');
select is(pg_temp.seq((select id from made where label = 'olga')), 8, 'without a mark the automatic value is the stored maximum + 1');

select * from finish();
rollback;
