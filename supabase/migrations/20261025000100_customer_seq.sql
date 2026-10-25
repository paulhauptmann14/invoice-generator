-- Per-customer counter ("Zaehler") for file names: invoices.customer_seq is assigned once, when the invoice is
-- first inserted, as max + 1 among the invoices of the same tenant, number range (null = its own group) and
-- customer. Updates never change it and deleted numbers are not reused.

alter table public.invoices
  add column customer_seq integer check (customer_seq is null or customer_seq >= 1);

-- Which invoices belong to "the same customer": the same customer_id, or, without one, the same recipient name
-- ignoring case and whitespace. The prefix keeps the two kinds apart.
create function private.customer_key(p_customer_id uuid, p_recipient jsonb) returns text
language sql
immutable
set search_path = ''
as $$
  select case
    when p_customer_id is not null then 'c:' || p_customer_id::text
    else 'n:' || lower(regexp_replace(btrim(coalesce(p_recipient ->> 'name', '')), '\s+', ' ', 'g'))
  end
$$;
revoke all on function private.customer_key(uuid, jsonb) from public, anon;
grant execute on function private.customer_key(uuid, jsonb) to authenticated;

-- Numbers every invoice that has no counter yet: row_number() per group ordered by issue_date, created_at, id,
-- continuing after the highest existing value of its group. updated_at stays as it was.
create function private.backfill_customer_seq() returns void
language plpgsql
set search_path = ''
as $$
begin
  alter table public.invoices disable trigger invoices_updated_at;
  with ranked as (
    select
      i.id, i.tenant_id, i.number_range_id,
      private.customer_key(i.customer_id, i.recipient) as ckey,
      row_number() over (
        partition by i.tenant_id, i.number_range_id, private.customer_key(i.customer_id, i.recipient)
        order by i.issue_date, i.created_at, i.id
      ) as rn
    from public.invoices i
    where i.customer_seq is null
  )
  update public.invoices i set customer_seq = r.rn + coalesce((
    select max(o.customer_seq) from public.invoices o
    where o.tenant_id = r.tenant_id
      and o.number_range_id is not distinct from r.number_range_id
      and private.customer_key(o.customer_id, o.recipient) = r.ckey
  ), 0)
  from ranked r
  where i.id = r.id;
  alter table public.invoices enable trigger invoices_updated_at;
end;
$$;
revoke all on function private.backfill_customer_seq() from public, anon, authenticated;

select private.backfill_customer_seq();

-- save_invoice additionally assigns customer_seq on insert. Signature, security and grants are unchanged.
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
  v_discount_kind text := nullif(p_invoice ->> 'discount_kind', '');
  v_discount_value numeric := nullif(p_invoice ->> 'discount_value', '')::numeric;
  v_range_id uuid := nullif(p_invoice ->> 'number_range_id', '')::uuid;
  v_customer_key text;
  v_customer_seq int;
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
    -- Per-customer counter, assigned once: max + 1 within tenant, number range (null = its own group) and
    -- customer. The lock serializes parallel inserts of the same group until the transaction ends.
    v_customer_key := private.customer_key(v_customer_id, v_recipient);
    perform pg_advisory_xact_lock(hashtextextended(
      p_tenant_id::text || '|' || coalesce(v_range_id::text, '-') || '|' || v_customer_key, 0));
    select coalesce(max(i.customer_seq), 0) + 1 into v_customer_seq
    from public.invoices i
    where i.tenant_id = p_tenant_id
      and i.number_range_id is not distinct from v_range_id
      and private.customer_key(i.customer_id, i.recipient) = v_customer_key;

    insert into public.invoices (
      tenant_id, number, number_range_id, customer_id, recipient, issue_date, service_date_from, service_date_to,
      payment_days, intro_text, closing_text, discount_kind, discount_value, customer_seq
    ) values (
      p_tenant_id,
      p_invoice ->> 'number',
      v_range_id,
      v_customer_id,
      v_recipient,
      (p_invoice ->> 'issue_date')::date,
      (p_invoice ->> 'service_date_from')::date,
      nullif(p_invoice ->> 'service_date_to', '')::date,
      (p_invoice ->> 'payment_days')::int,
      p_invoice ->> 'intro_text',
      p_invoice ->> 'closing_text',
      v_discount_kind,
      v_discount_value,
      v_customer_seq
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
      closing_text = p_invoice ->> 'closing_text',
      discount_kind = v_discount_kind,
      discount_value = v_discount_value
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
      tenant_id, invoice_id, position, description, quantity, unit, unit_price_gross, vat_rate, article_id,
      discount_kind, discount_value
    ) values (
      p_tenant_id,
      v_id,
      v_pos,
      v_item ->> 'description',
      (v_item ->> 'quantity')::numeric,
      coalesce(v_item ->> 'unit', ''),
      (v_item ->> 'unit_price_gross')::numeric,
      (v_item ->> 'vat_rate')::numeric,
      v_article_id,
      nullif(v_item ->> 'discount_kind', ''),
      nullif(v_item ->> 'discount_value', '')::numeric
    );
    v_pos := v_pos + 1;
  end loop;

  return v_id;
end;
$$;
