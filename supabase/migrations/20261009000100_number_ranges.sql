-- Several number ranges per business (e.g. invoices "G{N}/{JJ}" and vouchers "GU{N}/{JJ}").
-- Replaces settings.number_format; every invoice remembers the range its number came from.

create table public.number_ranges (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  name text not null check (length(trim(name)) between 1 and 60),
  -- Exactly one counter token ({N…}); unknown tokens are rejected by the app (validateNumberFormat).
  format text not null check (length(format) between 1 and 50 and array_length(regexp_split_to_array(format, '\{N+\}'), 1) = 2),
  is_default boolean not null default false,
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, tenant_id),
  unique (tenant_id, name),
  check (not (is_default and archived_at is not null))
);
create unique index number_ranges_one_default_idx on public.number_ranges (tenant_id) where is_default;
create index number_ranges_tenant_id_idx on public.number_ranges (tenant_id);
create trigger number_ranges_updated_at before update on public.number_ranges for each row execute function public.set_updated_at();
create trigger number_ranges_keep_tenant_id before update of tenant_id on public.number_ranges
  for each row execute function private.keep_tenant_id();

-- No delete: ranges that numbered invoices are archived instead.
grant select, insert, update on public.number_ranges to authenticated;
alter table public.number_ranges enable row level security;
create policy tenant_members_all on public.number_ranges for all to authenticated
  using ((select private.is_tenant_member(tenant_id))) with check ((select private.is_tenant_member(tenant_id)));

alter table public.invoices add column number_range_id uuid;
alter table public.invoices add constraint invoices_number_range_fkey foreign key (number_range_id, tenant_id)
  references public.number_ranges (id, tenant_id) on delete set null (number_range_id);
create index invoices_number_range_id_idx on public.invoices (number_range_id);

-- Does an invoice number fit a range format? Same rules as the app's suggestNextNumber:
-- {JJJJ} = 4 digits, {JJ} = 2 digits, {N…} = digits, everything else literal.
create function private.number_matches_format(p_number text, p_format text) returns boolean
language sql
immutable
set search_path = ''
as $$
  select p_number ~ ('^' ||
    regexp_replace(regexp_replace(regexp_replace(
      regexp_replace(p_format, '([.*+?^$()|\[\]\\])', '\\\1', 'g'),
      '\{JJJJ\}', '[0-9]{4}', 'g'), '\{JJ\}', '[0-9]{2}', 'g'), '\{N+\}', '[0-9]+', 'g')
    || '$');
$$;
revoke all on function private.number_matches_format(text, text) from public, anon, authenticated;

-- Existing data: one default range "Rechnungen" per tenant from the old single format;
-- invoices whose number fits that format belong to it, all others stay manual.
insert into public.number_ranges (tenant_id, name, format, is_default)
select s.tenant_id, 'Rechnungen', coalesce(nullif(trim(s.number_format), ''), '{JJJJ}-{NNNN}'), true
from public.settings s;
update public.invoices i set number_range_id = r.id
from public.number_ranges r
where r.tenant_id = i.tenant_id and private.number_matches_format(i.number, r.format);
alter table public.settings drop column number_format;

-- Switching the default. Two statements: the unique index is checked per statement,
-- so the old default is cleared first.
create function public.set_default_number_range(p_tenant_id uuid, p_id uuid) returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_archived timestamptz;
begin
  if p_tenant_id is null or not private.is_tenant_member(p_tenant_id) then
    raise exception 'access denied' using errcode = '42501';
  end if;
  select archived_at into v_archived from public.number_ranges where id = p_id and tenant_id = p_tenant_id;
  if not found then
    raise exception 'number range not found' using errcode = 'P0002';
  end if;
  if v_archived is not null then
    raise exception 'archived number range cannot be the default' using errcode = '22023';
  end if;
  update public.number_ranges set is_default = false where tenant_id = p_tenant_id and is_default and id <> p_id;
  update public.number_ranges set is_default = true where id = p_id and tenant_id = p_tenant_id;
end;
$$;
revoke all on function public.set_default_number_range(uuid, uuid) from public, anon;
grant execute on function public.set_default_number_range(uuid, uuid) to authenticated;

-- New tenants start with the default range "Rechnungen" (create or replace keeps the grants).
create or replace function private.create_tenant(p_name text) returns uuid
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
  insert into public.number_ranges (tenant_id, name, format, is_default) values (v_id, 'Rechnungen', '{JJJJ}-{NNNN}', true);
  return v_id;
end;
$$;

-- save_invoice stores p_invoice.number_range_id (empty = manual number); signature unchanged.
create or replace function public.save_invoice(p_tenant_id uuid, p_id uuid, p_invoice jsonb, p_items jsonb)
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
      tenant_id, number, number_range_id, customer_id, recipient, issue_date, service_date_from, service_date_to,
      payment_days, intro_text, closing_text
    ) values (
      p_tenant_id,
      p_invoice ->> 'number',
      nullif(p_invoice ->> 'number_range_id', '')::uuid,
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
      number_range_id = nullif(p_invoice ->> 'number_range_id', '')::uuid,
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
