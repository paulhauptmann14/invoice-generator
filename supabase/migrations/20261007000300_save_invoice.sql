-- Saves an invoice and its line items atomically.
--   p_id = null -> insert; otherwise update (line items are replaced completely).
--   p_items: array of { description, quantity, unit, unit_price_gross, vat_rate, article_id?, save_as_article? };
--            array order defines the position.
--   save_as_article = true without article_id -> creates an article and links it.
-- Errors: 42501 (not a member), P0002 (invoice not found), 23505 (duplicate number).
-- security invoker: RLS applies in addition to the explicit membership check.
create function public.save_invoice(p_id uuid, p_invoice jsonb, p_items jsonb)
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
begin
  if not private.is_member() then
    raise exception 'access denied' using errcode = '42501';
  end if;

  if p_id is null then
    insert into public.invoices (
      number, customer_id, recipient, issue_date, service_date_from, service_date_to,
      payment_days, intro_text, closing_text
    ) values (
      p_invoice ->> 'number',
      nullif(p_invoice ->> 'customer_id', '')::uuid,
      coalesce(p_invoice -> 'recipient', '{}'::jsonb),
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
      customer_id = nullif(p_invoice ->> 'customer_id', '')::uuid,
      recipient = coalesce(p_invoice -> 'recipient', '{}'::jsonb),
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

revoke all on function public.save_invoice(uuid, jsonb, jsonb) from public, anon;
grant execute on function public.save_invoice(uuid, jsonb, jsonb) to authenticated;
