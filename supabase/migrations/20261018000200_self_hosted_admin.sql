-- Admin-only functions for self-hosting: shell scripts call them as the database owner (docker exec ... psql)
-- to create the first account and to reset a forgotten password. The app roles must never reach them.

-- Shared by create_tenant (signed-in user) and bootstrap_owner (admin): tenant, owner membership, settings, default number range.
create function private.insert_tenant(p_user uuid, p_name text) returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
begin
  insert into public.tenants (name, created_by) values (p_name, p_user) returning id into v_id;
  insert into private.tenant_members (tenant_id, user_id, role) values (v_id, p_user, 'owner');
  -- The company name on invoices starts as the tenant name and is edited in the settings.
  insert into public.settings (tenant_id, company) values (v_id, jsonb_build_object('name', p_name));
  insert into public.number_ranges (tenant_id, name, format, is_default) values (v_id, 'Rechnungen', '{JJJJ}-{NNNN}', true);
  return v_id;
end;
$$;
revoke all on function private.insert_tenant(uuid, text) from public, anon, authenticated;

-- Same behavior and grants as before (create or replace keeps them); only the inserts moved into the helper.
create or replace function private.create_tenant(p_name text) returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_name text := trim(coalesce(p_name, ''));
  v_user uuid := (select auth.uid());
begin
  if v_user is null or not private.can_create_tenant() then
    raise exception 'access denied' using errcode = '42501';
  end if;
  if length(v_name) not between 1 and 120 then
    raise exception 'invalid tenant name' using errcode = '22023';
  end if;
  return private.insert_tenant(v_user, v_name);
end;
$$;

-- Creates the auth user (same shape as supabase/seed.sql) and the first business. Returns the tenant id.
create function private.bootstrap_owner(p_email text, p_password text, p_tenant_name text) returns uuid
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
    extensions.crypt(p_password, extensions.gen_salt('bf')), now(),
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
create function private.set_password(p_email text, p_password text) returns void
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

  update auth.users set encrypted_password = extensions.crypt(p_password, extensions.gen_salt('bf')), updated_at = now() where id = v_user;
  delete from auth.sessions where user_id = v_user;
  delete from auth.refresh_tokens where user_id = v_user::text;
end;
$$;
revoke all on function private.set_password(text, text) from public, anon, authenticated;
