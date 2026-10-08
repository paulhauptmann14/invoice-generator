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

-- Two sample businesses owned by the dev user (fixed ids, see src/test-support/seed-ids.ts).
insert into public.tenants (id, name, created_by) values
  ('c0000000-0000-4000-8000-000000000001', 'Gasthaus Beispiel', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'),
  ('c0000000-0000-4000-8000-000000000002', 'Metzgerei Beispiel', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa');
insert into private.tenant_members (tenant_id, user_id, role) values
  ('c0000000-0000-4000-8000-000000000001', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'owner'),
  ('c0000000-0000-4000-8000-000000000002', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'owner');

-- Sample company data so exports work out of the box locally.
insert into public.settings (tenant_id, company) values
('c0000000-0000-4000-8000-000000000001', '{
  "name": "Gasthaus Beispiel",
  "street": "Hauptstraße 1",
  "postalCode": "12345",
  "city": "Musterstadt",
  "taxNumber": "12/345/67890",
  "iban": "DE89370400440532013000",
  "bic": "COBADEFFXXX",
  "bankName": "Commerzbank",
  "bankAccounts": [
    { "bankName": "Volksbank Beispiel", "accountNumber": "4711", "iban": "DE02120300000000202051", "bic": "BYLADEM1001" },
    { "bankName": "Sparkasse Beispiel", "accountNumber": "0815", "iban": "DE02500105170137075030", "bic": "INGDDEFFXXX" }
  ]
}'::jsonb),
('c0000000-0000-4000-8000-000000000002', '{
  "name": "Metzgerei Beispiel",
  "street": "Marktplatz 3",
  "postalCode": "12345",
  "city": "Musterstadt",
  "taxNumber": "12/345/67891",
  "bankAccounts": [
    { "bankName": "Sparkasse Beispiel", "accountNumber": "", "iban": "DE02500105170137075030", "bic": "INGDDEFFXXX" }
  ]
}'::jsonb);

-- Authenticated but without any business: used to verify the "no access" path.
-- stranger@invoice.localhost / lokales-dev-passwort-123
insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
  confirmation_token, recovery_token, email_change, email_change_token_new,
  email_change_token_current, phone_change, phone_change_token, reauthentication_token
) values (
  '00000000-0000-0000-0000-000000000000',
  'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
  'authenticated', 'authenticated',
  'stranger@invoice.localhost',
  extensions.crypt('lokales-dev-passwort-123', extensions.gen_salt('bf')),
  now(),
  '{"provider":"email","providers":["email"]}', '{}', now(), now(),
  '', '', '', '',
  '', '', '', ''
);

insert into auth.identities (id, user_id, provider_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
values (
  gen_random_uuid(),
  'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
  'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
  '{"sub":"bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb","email":"stranger@invoice.localhost","email_verified":true}',
  'email', now(), now(), now()
);
