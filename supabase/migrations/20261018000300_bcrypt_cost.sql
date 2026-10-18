-- GoTrue hashes passwords with bcrypt cost 10; the admin functions used pgcrypto's default cost (6). Same behavior otherwise.
-- create or replace keeps the grants; the revokes below repeat them so this file is correct on its own.

-- Creates the auth user (same shape as supabase/seed.sql) and the first business. Returns the tenant id.
create or replace function private.bootstrap_owner(p_email text, p_password text, p_tenant_name text) returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_email text := lower(trim(coalesce(p_email, '')));
  v_name text := trim(coalesce(p_tenant_name, ''));
  v_user uuid := gen_random_uuid();
begin
  if v_email !~ '^[^@\s]+@[^@\s]+$' then
    raise exception 'invalid e-mail address' using errcode = '22023';
  end if;
  if length(coalesce(p_password, '')) < 12 then
    raise exception 'password must have at least 12 characters' using errcode = '22023';
  end if;
  if length(v_name) not between 1 and 120 then
    raise exception 'invalid tenant name' using errcode = '22023';
  end if;
  if exists (select 1 from auth.users where lower(email) = v_email) then
    raise exception 'user already exists' using errcode = '23505';
  end if;

  -- Token columns must be empty strings, not NULL, or GoTrue fails on sign-in.
  insert into auth.users (
    instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
    raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
    confirmation_token, recovery_token, email_change, email_change_token_new,
    email_change_token_current, phone_change, phone_change_token, reauthentication_token
  ) values (
    '00000000-0000-0000-0000-000000000000', v_user, 'authenticated', 'authenticated', v_email,
    extensions.crypt(p_password, extensions.gen_salt('bf', 10)), now(),
    '{"provider":"email","providers":["email"]}', '{}', now(), now(),
    '', '', '', '',
    '', '', '', ''
  );
  insert into auth.identities (id, user_id, provider_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
  values (
    gen_random_uuid(), v_user, v_user::text,
    jsonb_build_object('sub', v_user::text, 'email', v_email, 'email_verified', true),
    'email', now(), now(), now()
  );

  return private.insert_tenant(v_user, v_name);
end;
$$;
revoke all on function private.bootstrap_owner(text, text, text) from public, anon, authenticated;

-- Sets a new password and signs the user out everywhere.
create or replace function private.set_password(p_email text, p_password text) returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_email text := lower(trim(coalesce(p_email, '')));
  v_user uuid;
begin
  if v_email !~ '^[^@\s]+@[^@\s]+$' then
    raise exception 'invalid e-mail address' using errcode = '22023';
  end if;
  if length(coalesce(p_password, '')) < 12 then
    raise exception 'password must have at least 12 characters' using errcode = '22023';
  end if;
  select id into v_user from auth.users where lower(email) = v_email;
  if not found then
    raise exception 'user not found' using errcode = 'P0002';
  end if;

  update auth.users set encrypted_password = extensions.crypt(p_password, extensions.gen_salt('bf', 10)), updated_at = now() where id = v_user;
  delete from auth.sessions where user_id = v_user;
  delete from auth.refresh_tokens where user_id = v_user::text;
end;
$$;
revoke all on function private.set_password(text, text) from public, anon, authenticated;
