-- Headings between invoice items (e.g. "KW 41"): a line of text that groups the items below it. It has no amounts,
-- is not numbered and does not count towards any total. Stored as invoice_items with kind 'heading' so that its
-- position orders it among the items.

alter table public.invoice_items add column kind text not null default 'item';
alter table public.invoice_items alter column unit_price_gross drop not null;
alter table public.invoice_items alter column vat_rate drop not null;

-- An item has a price and a VAT rate; a heading has nothing but its text. Null-safe: every branch is true or false.
alter table public.invoice_items
  add constraint invoice_items_kind_check check (
    (kind = 'item' and unit_price_gross is not null and vat_rate is not null)
    or (kind = 'heading' and quantity is null and unit = '' and unit_price_gross is null and vat_rate is null
        and article_id is null and discount_kind is null and discount_value is null)
  );

-- save_invoice: signature, security and grants unchanged; an item of p_items may carry "kind": "heading".
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
  v_manual_seq int := nullif(p_invoice ->> 'customer_seq', '')::int;
  v_kind text;
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
    -- Per-customer counter: the given value, or the next free one (see private.claim_customer_seq).
    v_customer_key := private.customer_key(v_customer_id, v_recipient);
    v_customer_seq := private.claim_customer_seq(p_tenant_id, v_range_id, v_customer_key, v_manual_seq);

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
    -- A given value replaces the stored counter (and raises the high-water mark); none keeps the stored one.
    if v_manual_seq is not null then
      v_customer_seq := private.claim_customer_seq(
        p_tenant_id, v_range_id, private.customer_key(v_customer_id, v_recipient), v_manual_seq);
    end if;

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
      discount_value = v_discount_value,
      customer_seq = coalesce(v_customer_seq, customer_seq)
    where id = p_id and tenant_id = p_tenant_id
    returning id into v_id;

    if v_id is null then
      raise exception 'invoice not found' using errcode = 'P0002';
    end if;

    delete from public.invoice_items where invoice_id = v_id and tenant_id = p_tenant_id;
  end if;

  for v_item in select value from jsonb_array_elements(coalesce(p_items, '[]'::jsonb)) loop
    v_kind := coalesce(nullif(v_item ->> 'kind', ''), 'item');
    v_article_id := nullif(v_item ->> 'article_id', '')::uuid;

    -- A heading is only its text: no amounts, no article (the check constraint enforces the shape).
    if v_kind = 'heading' then
      insert into public.invoice_items (tenant_id, invoice_id, position, kind, description, quantity, unit, unit_price_gross, vat_rate)
      values (p_tenant_id, v_id, v_pos, 'heading', v_item ->> 'description', null, '', null, null);
      v_pos := v_pos + 1;
      continue;
    end if;

    if v_article_id is null and coalesce((v_item ->> 'save_as_article')::boolean, false) then
      insert into public.articles (tenant_id, name, unit, unit_price_gross, vat_rate, without_quantity)
      values (
        p_tenant_id,
        v_item ->> 'description',
        coalesce(v_item ->> 'unit', ''),
        (v_item ->> 'unit_price_gross')::numeric,
        (v_item ->> 'vat_rate')::numeric,
        -- A line without a quantity becomes an article that starts without one.
        (v_item ->> 'quantity') is null
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
