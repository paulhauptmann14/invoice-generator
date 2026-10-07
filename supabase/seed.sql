-- Local development only. Applied by `supabase db reset`; never pushed to the cloud project.

-- Dev user: dev@invoice.localhost / lokales-dev-passwort-123
insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
  confirmation_token, recovery_token, email_change, email_change_token_new,
  email_change_token_current, phone_change, phone_change_token, reauthentication_token
) values (
  '00000000-0000-0000-0000-000000000000',
  'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
  'authenticated', 'authenticated',
  'dev@invoice.localhost',
  extensions.crypt('lokales-dev-passwort-123', extensions.gen_salt('bf')),
  now(),
  '{"provider":"email","providers":["email"]}', '{}', now(), now(),
  '', '', '', '',
  '', '', '', ''
);
-- Token columns must be empty strings, not NULL, or GoTrue fails on sign-in.

insert into auth.identities (id, user_id, provider_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
values (
  gen_random_uuid(),
  'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
  'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
  '{"sub":"aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa","email":"dev@invoice.localhost","email_verified":true}',
  'email', now(), now(), now()
);

insert into private.members (user_id) values ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa');

-- Sample company data so exports work out of the box locally.
update public.settings set company = '{
  "name": "Gasthaus & Metzgerei Beispiel",
  "street": "Hauptstraße 1",
  "postalCode": "12345",
  "city": "Musterstadt",
  "taxNumber": "12/345/67890",
  "iban": "DE89370400440532013000",
  "bic": "COBADEFFXXX",
  "bankName": "Commerzbank"
}'::jsonb;
