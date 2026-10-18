begin;
create extension if not exists pgtap with schema extensions;
select plan(32);

select has_function('private', 'bootstrap_owner', array['text', 'text', 'text'], 'bootstrap_owner exists');
select has_function('private', 'set_password', array['text', 'text'], 'set_password exists');

-- 1) bootstrap_owner creates the user and the first business
create temp table bootstrap_result as
  select private.bootstrap_owner('  Owner@Test.localhost ', 'zwölf-zeichen-pw', 'Testbetrieb') as tenant_id;
select ok((select tenant_id is not null from bootstrap_result), 'bootstrap_owner returns the tenant id');
select is((select count(*)::int from auth.users where email = 'owner@test.localhost'), 1, 'one auth user with the normalized e-mail');
select ok(
  (select encrypted_password = extensions.crypt('zwölf-zeichen-pw', encrypted_password) from auth.users where email = 'owner@test.localhost'),
  'the password is stored as a bcrypt hash');
select ok(
  (select encrypted_password like '$2a$10$%' from auth.users where email = 'owner@test.localhost'),
  'the hash uses bcrypt cost 10 like GoTrue');
select ok((select email_confirmed_at is not null from auth.users where email = 'owner@test.localhost'), 'the e-mail is confirmed');
select is(
  (select confirmation_token || recovery_token || email_change || email_change_token_new || email_change_token_current || phone_change || phone_change_token || reauthentication_token
   from auth.users where email = 'owner@test.localhost'),
  '', 'token columns are empty strings, not NULL');
select is(
  (select count(*)::int from auth.identities i join auth.users u on u.id = i.user_id where u.email = 'owner@test.localhost' and i.provider = 'email'),
  1, 'one email identity');
select is(
  (select m.role from private.tenant_members m join auth.users u on u.id = m.user_id
   where u.email = 'owner@test.localhost' and m.tenant_id = (select tenant_id from bootstrap_result)),
  'owner', 'the user owns the new business');
select is((select name from public.tenants where id = (select tenant_id from bootstrap_result)), 'Testbetrieb', 'tenant name is set');
select is((select company ->> 'name' from public.settings where tenant_id = (select tenant_id from bootstrap_result)), 'Testbetrieb', 'company name starts as the tenant name');
select is((select count(*)::int from public.number_ranges where tenant_id = (select tenant_id from bootstrap_result)), 1, 'exactly one number range');
select is(
  (select name || '|' || format || '|' || is_default::text from public.number_ranges where tenant_id = (select tenant_id from bootstrap_result)),
  'Rechnungen|{JJJJ}-{NNNN}|true', 'it is the default range "Rechnungen"');

-- 2) bootstrap_owner validation
select throws_ok($$select private.bootstrap_owner('x@test.localhost', 'kurz', 'Betrieb')$$, '22023', null, 'short password is rejected');
select throws_ok($$select private.bootstrap_owner('x@test.localhost', null, 'Betrieb')$$, '22023', null, 'missing password is rejected');
select throws_ok($$select private.bootstrap_owner('', 'zwölf-zeichen-pw', 'Betrieb')$$, '22023', null, 'empty e-mail is rejected');
select throws_ok($$select private.bootstrap_owner('kein-at-zeichen', 'zwölf-zeichen-pw', 'Betrieb')$$, '22023', null, 'invalid e-mail is rejected');
select throws_ok($$select private.bootstrap_owner('x@test.localhost', 'zwölf-zeichen-pw', '  ')$$, '22023', null, 'blank tenant name is rejected');
select throws_ok($$select private.bootstrap_owner('x@test.localhost', 'zwölf-zeichen-pw', repeat('a', 121))$$, '22023', null, 'tenant name over 120 characters is rejected');
select throws_ok($$select private.bootstrap_owner('OWNER@test.localhost', 'zwölf-zeichen-pw', 'Betrieb')$$, '23505', null, 'duplicate e-mail is rejected (case-insensitive)');
select is((select count(*)::int from public.tenants where name = 'Betrieb'), 0, 'rejected calls leave no tenant behind');

-- 3) set_password changes the hash and signs the user out everywhere
insert into auth.sessions (id, user_id, created_at, updated_at)
  select 'dddddddd-0000-4000-8000-00000000000d', id, now(), now() from auth.users where email = 'owner@test.localhost';
insert into auth.refresh_tokens (token, user_id, session_id, revoked)
  select 'pgtap-refresh-token', id::text, 'dddddddd-0000-4000-8000-00000000000d', false from auth.users where email = 'owner@test.localhost';

select lives_ok($$select private.set_password(' OWNER@test.localhost', 'neues-passwort-123')$$, 'set_password succeeds');
select ok(
  (select encrypted_password = extensions.crypt('neues-passwort-123', encrypted_password) from auth.users where email = 'owner@test.localhost'),
  'the new password is stored');
select ok(
  (select encrypted_password like '$2a$10$%' from auth.users where email = 'owner@test.localhost'),
  'the new hash uses bcrypt cost 10');
select is((select count(*)::int from auth.sessions where user_id = (select id from auth.users where email = 'owner@test.localhost')), 0, 'sessions are deleted');
select is((select count(*)::int from auth.refresh_tokens where user_id = (select id::text from auth.users where email = 'owner@test.localhost')), 0, 'refresh tokens are deleted');
select throws_ok($$select private.set_password('niemand@test.localhost', 'neues-passwort-123')$$, 'P0002', null, 'unknown e-mail is rejected');
select throws_ok($$select private.set_password('owner@test.localhost', 'kurz')$$, '22023', null, 'short password is rejected by set_password');

-- 4) only admins (the postgres role) can call them
select ok(not has_function_privilege('authenticated', 'private.bootstrap_owner(text, text, text)', 'execute'), 'authenticated cannot call bootstrap_owner');
select ok(not has_function_privilege('anon', 'private.bootstrap_owner(text, text, text)', 'execute'), 'anon cannot call bootstrap_owner');
select ok(not has_function_privilege('authenticated', 'private.set_password(text, text)', 'execute')
  and not has_function_privilege('anon', 'private.set_password(text, text)', 'execute'), 'neither anon nor authenticated can call set_password');

select * from finish();
rollback;
