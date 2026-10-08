-- Multiple businesses ("Betriebe", tenants). Every data row belongs to exactly one tenant;
-- access is granted per tenant through private.tenant_members.
-- Prepared for more users per tenant, invitations and public sign-up: only
-- private.can_create_tenant() and the auth settings change for those.

-- 1) Tenants and memberships
create table public.tenants (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(trim(name)) between 1 and 120),
  created_by uuid default auth.uid() references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger tenants_updated_at before update on public.tenants for each row execute function public.set_updated_at();

create table private.tenant_members (
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  -- Not evaluated yet (all members are equal); prepared for invitations and owner-only actions.
  role text not null default 'owner' check (role in ('owner', 'member')),
  created_at timestamptz not null default now(),
  primary key (tenant_id, user_id)
);
create index tenant_members_user_id_idx on private.tenant_members (user_id);
-- RLS on, no policy, no grants: read only through the security definer functions below.
alter table private.tenant_members enable row level security;
revoke all on private.tenant_members from public, anon, authenticated;

create function private.is_tenant_member(p_tenant_id uuid) returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from private.tenant_members m
    where m.tenant_id = p_tenant_id and m.user_id = (select auth.uid())
  );
$$;
revoke all on function private.is_tenant_member(uuid) from public, anon;
grant execute on function private.is_tenant_member(uuid) to authenticated;

-- 2) tenant_id on every data table (filled below, then required)
alter table public.settings add column tenant_id uuid;
alter table public.customers add column tenant_id uuid;
alter table public.articles add column tenant_id uuid;
alter table public.invoices add column tenant_id uuid;
alter table public.invoice_items add column tenant_id uuid;
alter table public.invoice_exports add column tenant_id uuid;

-- Existing single-business data becomes the first tenant. On a fresh database (no members,
-- no data; the seed runs after the migrations) no tenant is created and the default settings
-- row is removed.
do $$
declare
  v_tenant uuid;
begin
  if exists (select 1 from private.members)
     or exists (select 1 from public.customers)
     or exists (select 1 from public.articles)
     or exists (select 1 from public.invoices) then
    insert into public.tenants (name)
    select left(coalesce(nullif(trim(s.company ->> 'name'), ''), 'Mein Betrieb'), 120)
    from public.settings s
    order by s.id
    limit 1
    returning id into v_tenant;

    if v_tenant is null then
      insert into public.tenants (name) values ('Mein Betrieb') returning id into v_tenant;
      insert into public.settings (id) values (1);
    end if;

    update public.settings set tenant_id = v_tenant;
    update public.customers set tenant_id = v_tenant;
    update public.articles set tenant_id = v_tenant;
    update public.invoices set tenant_id = v_tenant;
    update public.invoice_items set tenant_id = v_tenant;
    update public.invoice_exports set tenant_id = v_tenant;
    insert into private.tenant_members (tenant_id, user_id, role)
    select v_tenant, m.user_id, 'owner' from private.members m;
  else
    delete from public.settings;
  end if;
end;
$$;

-- settings: one row per tenant instead of the single row id = 1
alter table public.settings drop constraint settings_pkey;
alter table public.settings drop column id;
alter table public.settings alter column tenant_id set not null;
alter table public.settings add primary key (tenant_id);
alter table public.settings add constraint settings_tenant_fkey
  foreign key (tenant_id) references public.tenants (id) on delete cascade;

do $$
declare t text;
begin
  foreach t in array array['customers', 'articles', 'invoices', 'invoice_items', 'invoice_exports'] loop
    execute format('alter table public.%I alter column tenant_id set not null', t);
    execute format(
      'alter table public.%I add constraint %I foreign key (tenant_id) references public.tenants (id) on delete cascade',
      t, t || '_tenant_fkey'
    );
    execute format('create index %I on public.%I (tenant_id)', t || '_tenant_id_idx', t);
  end loop;
end;
$$;

-- Targets for composite foreign keys: references never cross tenant boundaries.
alter table public.customers add constraint customers_id_tenant_key unique (id, tenant_id);
alter table public.articles add constraint articles_id_tenant_key unique (id, tenant_id);
alter table public.invoices add constraint invoices_id_tenant_key unique (id, tenant_id);

alter table public.invoices
  drop constraint invoices_customer_id_fkey,
  add constraint invoices_customer_fkey foreign key (customer_id, tenant_id)
    references public.customers (id, tenant_id) on delete set null (customer_id);
alter table public.invoice_items
  drop constraint invoice_items_invoice_id_fkey,
  add constraint invoice_items_invoice_fkey foreign key (invoice_id, tenant_id)
    references public.invoices (id, tenant_id) on delete cascade,
  drop constraint invoice_items_article_id_fkey,
  add constraint invoice_items_article_fkey foreign key (article_id, tenant_id)
    references public.articles (id, tenant_id) on delete set null (article_id);
alter table public.invoice_exports
  drop constraint invoice_exports_invoice_id_fkey,
  add constraint invoice_exports_invoice_fkey foreign key (invoice_id, tenant_id)
    references public.invoices (id, tenant_id) on delete cascade;

-- Invoice numbers are unique per tenant.
alter table public.invoices drop constraint invoices_number_key;
alter table public.invoices add constraint invoices_tenant_number_key unique (tenant_id, number);

-- A row never moves to another tenant (RLS alone would allow moving it between own tenants).
create function private.keep_tenant_id() returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.tenant_id is distinct from old.tenant_id then
    raise exception 'tenant_id cannot be changed' using errcode = '42501';
  end if;
  return new;
end;
$$;
revoke all on function private.keep_tenant_id() from public, anon, authenticated;

do $$
declare t text;
begin
  foreach t in array array['settings', 'customers', 'articles', 'invoices', 'invoice_items', 'invoice_exports'] loop
    execute format(
      'create trigger %I before update of tenant_id on public.%I for each row execute function private.keep_tenant_id()',
      t || '_keep_tenant_id', t
    );
  end loop;
end;
$$;

-- 3) Grants and RLS
grant select, update (name) on public.tenants to authenticated;
alter table public.tenants enable row level security;
create policy tenant_members_select on public.tenants for select to authenticated
  using ((select private.is_tenant_member(id)));
create policy tenant_members_update on public.tenants for update to authenticated
  using ((select private.is_tenant_member(id))) with check ((select private.is_tenant_member(id)));

do $$
declare t text;
begin
  foreach t in array array['settings', 'customers', 'articles', 'invoices', 'invoice_items', 'invoice_exports'] loop
    execute format('drop policy members_all on public.%I', t);
    execute format(
      'create policy tenant_members_all on public.%I for all to authenticated '
      'using ((select private.is_tenant_member(tenant_id))) with check ((select private.is_tenant_member(tenant_id)))',
      t
    );
  end loop;
end;
$$;

-- 4) Storage: every object path starts with the tenant id ("<tenant>/...").
-- Returns null for anything else, so invalid paths simply grant no access.
create function private.storage_tenant(p_name text) returns uuid
language sql
immutable
set search_path = ''
as $$
  select case
    when position('/' in p_name) > 0
     and split_part(p_name, '/', 1) ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    then split_part(p_name, '/', 1)::uuid
  end;
$$;
revoke all on function private.storage_tenant(text) from public, anon;
grant execute on function private.storage_tenant(text) to authenticated;

drop policy members_select on storage.objects;
drop policy members_insert on storage.objects;
drop policy members_update on storage.objects;
drop policy members_delete on storage.objects;

create policy tenant_members_select on storage.objects for select to authenticated
  using (bucket_id in ('assets', 'invoice-pdfs') and (select private.is_tenant_member(private.storage_tenant(name))));
create policy tenant_members_insert on storage.objects for insert to authenticated
  with check (bucket_id in ('assets', 'invoice-pdfs') and (select private.is_tenant_member(private.storage_tenant(name))));
create policy tenant_members_update on storage.objects for update to authenticated
  using (bucket_id in ('assets', 'invoice-pdfs') and (select private.is_tenant_member(private.storage_tenant(name))))
  with check (bucket_id in ('assets', 'invoice-pdfs') and (select private.is_tenant_member(private.storage_tenant(name))));
create policy tenant_members_delete on storage.objects for delete to authenticated
  using (bucket_id in ('assets', 'invoice-pdfs') and (select private.is_tenant_member(private.storage_tenant(name))));

-- 5) save_invoice takes the tenant explicitly.
--   p_id = null -> insert; otherwise update (line items are replaced completely).
--   p_items: array of { description, quantity, unit, unit_price_gross, vat_rate, article_id?, save_as_article? };
--            array order defines the position.
--   save_as_article = true without article_id -> creates an article and links it.
--   save_as_customer = true without customer_id -> creates the recipient as a customer.
-- Errors: 42501 (not a member of the tenant), P0002 (invoice not found in this tenant),
--         23505 (duplicate number in this tenant), 23503 (customer/article of another tenant).
-- security invoker: RLS applies in addition to the explicit membership check.
drop function public.save_invoice(uuid, jsonb, jsonb);

create function public.save_invoice(p_tenant_id uuid, p_id uuid, p_invoice jsonb, p_items jsonb)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_id uuid;
  v_item jsonb;
  v_pos int := 0;
  v_article_id uuid;
  v_customer_id uuid := nullif(p_invoice ->> 'customer_id', '')::uuid;
  v_recipient jsonb := coalesce(p_invoice -> 'recipient', '{}'::jsonb);
begin
  if p_tenant_id is null or not private.is_tenant_member(p_tenant_id) then
    raise exception 'access denied' using errcode = '42501';
  end if;

  if v_customer_id is null and coalesce((p_invoice ->> 'save_as_customer')::boolean, false) then
    insert into public.customers (tenant_id, name, contact_person, street, postal_code, city, country_code, vat_id)
    values (
      p_tenant_id,
      v_recipient ->> 'name',
      nullif(v_recipient ->> 'contactPerson', ''),
      coalesce(v_recipient ->> 'street', ''),
      coalesce(v_recipient ->> 'postalCode', ''),
      coalesce(v_recipient ->> 'city', ''),
      coalesce(nullif(v_recipient ->> 'countryCode', ''), 'DE'),
      nullif(v_recipient ->> 'vatId', '')
    )
    returning id into v_customer_id;
  end if;

  if p_id is null then
    insert into public.invoices (
      tenant_id, number, customer_id, recipient, issue_date, service_date_from, service_date_to,
      payment_days, intro_text, closing_text
    ) values (
      p_tenant_id,
      p_invoice ->> 'number',
      v_customer_id,
      v_recipient,
      (p_invoice ->> 'issue_date')::date,
      (p_invoice ->> 'service_date_from')::date,
      nullif(p_invoice ->> 'service_date_to', '')::date,
      (p_invoice ->> 'payment_days')::int,
      p_invoice ->> 'intro_text',
      p_invoice ->> 'closing_text'
    )
    returning id into v_id;
  else
    update public.invoices set
      number = p_invoice ->> 'number',
      customer_id = v_customer_id,
      recipient = v_recipient,
      issue_date = (p_invoice ->> 'issue_date')::date,
      service_date_from = (p_invoice ->> 'service_date_from')::date,
      service_date_to = nullif(p_invoice ->> 'service_date_to', '')::date,
      payment_days = (p_invoice ->> 'payment_days')::int,
      intro_text = p_invoice ->> 'intro_text',
      closing_text = p_invoice ->> 'closing_text'
    where id = p_id and tenant_id = p_tenant_id
    returning id into v_id;

    if v_id is null then
      raise exception 'invoice not found' using errcode = 'P0002';
    end if;

    delete from public.invoice_items where invoice_id = v_id and tenant_id = p_tenant_id;
  end if;

  for v_item in select value from jsonb_array_elements(coalesce(p_items, '[]'::jsonb)) loop
    v_article_id := nullif(v_item ->> 'article_id', '')::uuid;

    if v_article_id is null and coalesce((v_item ->> 'save_as_article')::boolean, false) then
      insert into public.articles (tenant_id, name, unit, unit_price_gross, vat_rate)
      values (
        p_tenant_id,
        v_item ->> 'description',
        coalesce(v_item ->> 'unit', ''),
        (v_item ->> 'unit_price_gross')::numeric,
        (v_item ->> 'vat_rate')::numeric
      )
      returning id into v_article_id;
    end if;

    insert into public.invoice_items (
      tenant_id, invoice_id, position, description, quantity, unit, unit_price_gross, vat_rate, article_id
    ) values (
      p_tenant_id,
      v_id,
      v_pos,
      v_item ->> 'description',
      (v_item ->> 'quantity')::numeric,
      coalesce(v_item ->> 'unit', ''),
      (v_item ->> 'unit_price_gross')::numeric,
      (v_item ->> 'vat_rate')::numeric,
      v_article_id
    );
    v_pos := v_pos + 1;
  end loop;

  return v_id;
end;
$$;
revoke all on function public.save_invoice(uuid, uuid, jsonb, jsonb) from public, anon;
grant execute on function public.save_invoice(uuid, uuid, jsonb, jsonb) to authenticated;

-- 6) Creating a tenant. The writing part needs security definer (memberships are not writable
-- through the API) and therefore lives in "private"; public.create_tenant is a security invoker
-- wrapper so it can be called as an RPC.
create function private.can_create_tenant() returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  -- For now only users who already belong to a tenant. The single switch for a later public sign-up.
  select exists (select 1 from private.tenant_members m where m.user_id = (select auth.uid()));
$$;
revoke all on function private.can_create_tenant() from public, anon;
grant execute on function private.can_create_tenant() to authenticated;

create function private.create_tenant(p_name text) returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_name text := trim(coalesce(p_name, ''));
  v_user uuid := (select auth.uid());
  v_id uuid;
begin
  if v_user is null or not private.can_create_tenant() then
    raise exception 'access denied' using errcode = '42501';
  end if;
  if length(v_name) not between 1 and 120 then
    raise exception 'invalid tenant name' using errcode = '22023';
  end if;

  insert into public.tenants (name, created_by) values (v_name, v_user) returning id into v_id;
  insert into private.tenant_members (tenant_id, user_id, role) values (v_id, v_user, 'owner');
  -- The company name on invoices starts as the tenant name and is edited in the settings.
  insert into public.settings (tenant_id, company) values (v_id, jsonb_build_object('name', v_name));
  return v_id;
end;
$$;
revoke all on function private.create_tenant(text) from public, anon;
grant execute on function private.create_tenant(text) to authenticated;

create function public.create_tenant(p_name text) returns uuid
language sql
security invoker
set search_path = ''
as $$
  select private.create_tenant(p_name);
$$;
revoke all on function public.create_tenant(text) from public, anon;
grant execute on function public.create_tenant(text) to authenticated;

-- 7) The global allow-list is replaced by tenant memberships.
drop function private.is_member();
drop table private.members;
