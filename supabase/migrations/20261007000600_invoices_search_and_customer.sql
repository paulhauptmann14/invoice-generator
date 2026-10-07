-- Search column for the invoice list (number + recipient name).
alter table public.invoices add column search_text text generated always as (
  lower(number || ' ' || coalesce(recipient ->> 'name', ''))
) stored;

-- save_invoice: optionally create the recipient as a new customer in the same transaction.
-- Signature unchanged, so existing grants (authenticated only) are kept.
create or replace function public.save_invoice(p_id uuid, p_invoice jsonb, p_items jsonb)
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
  if not private.is_member() then
    raise exception 'access denied' using errcode = '42501';
  end if;

  if v_customer_id is null and coalesce((p_invoice ->> 'save_as_customer')::boolean, false) then
    insert into public.customers (name, contact_person, street, postal_code, city, country_code, vat_id)
    values (
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
      number, customer_id, recipient, issue_date, service_date_from, service_date_to,
      payment_days, intro_text, closing_text
    ) values (
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
    where id = p_id
    returning id into v_id;

    if v_id is null then
      raise exception 'invoice not found' using errcode = 'P0002';
    end if;

    delete from public.invoice_items where invoice_id = v_id;
  end if;

  for v_item in select value from jsonb_array_elements(coalesce(p_items, '[]'::jsonb)) loop
    v_article_id := nullif(v_item ->> 'article_id', '')::uuid;

    if v_article_id is null and coalesce((v_item ->> 'save_as_article')::boolean, false) then
      insert into public.articles (name, unit, unit_price_gross, vat_rate)
      values (
        v_item ->> 'description',
        coalesce(v_item ->> 'unit', ''),
        (v_item ->> 'unit_price_gross')::numeric,
        (v_item ->> 'vat_rate')::numeric
      )
      returning id into v_article_id;
    end if;

    insert into public.invoice_items (
      invoice_id, position, description, quantity, unit, unit_price_gross, vat_rate, article_id
    ) values (
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
