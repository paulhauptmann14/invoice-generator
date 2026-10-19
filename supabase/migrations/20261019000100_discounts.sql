-- Discounts ("Rabatte"): optional percent or fixed-amount discount per invoice item and per invoice.
-- Both columns are null (no discount) or both set. Existing rows stay untouched (null).

alter table public.invoice_items
  add column discount_kind text,
  add column discount_value numeric(12, 2);

alter table public.invoices
  add column discount_kind text,
  add column discount_value numeric(12, 2);

-- Null-safe on purpose: a check constraint passes when its expression is null, so every branch is
-- written to evaluate to true or false, never null.
alter table public.invoice_items
  add constraint invoice_items_discount_check check (
    (discount_kind is null and discount_value is null)
    or (coalesce(discount_kind = 'percent', false) and discount_value is not null
        and discount_value > 0 and discount_value <= 100)
    or (coalesce(discount_kind = 'amount', false) and discount_value is not null
        and discount_value > 0 and discount_value <= round(quantity * unit_price_gross, 2))
  );

-- An invoice-level amount is checked against the subtotal in the app only (the subtotal is not a column).
alter table public.invoices
  add constraint invoices_discount_check check (
    (discount_kind is null and discount_value is null)
    or (coalesce(discount_kind = 'percent', false) and discount_value is not null
        and discount_value > 0 and discount_value <= 100)
    or (coalesce(discount_kind = 'amount', false) and discount_value is not null and discount_value > 0)
  );

-- save_invoice additionally stores discount_kind / discount_value of the invoice (p_invoice) and of every
-- item (p_items). Missing, null or empty = no discount. Signature, security and grants are unchanged.
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
      payment_days, intro_text, closing_text, discount_kind, discount_value
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
      p_invoice ->> 'closing_text',
      v_discount_kind,
      v_discount_value
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
