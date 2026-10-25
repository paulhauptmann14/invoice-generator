-- Manual per-customer counter and a high-water mark so that counter values are never handed out twice.
--
-- * private.customer_counters keeps, per tenant, number range (nil uuid = invoices without a range) and customer key,
--   the highest counter ever used. The automatic value is greatest(mark, current max) + 1, so deleting the newest
--   invoice does not free its number. Manual values raise the mark and never lower it.
-- * save_invoice reads an optional "customer_seq" from the invoice payload (signature unchanged): on insert a given
--   value is used instead of the automatic one, on update a given value replaces the stored one and null/absent
--   keeps it.

create table private.customer_counters (
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  range_key uuid not null,
  customer_key text not null,
  last_seq integer not null check (last_seq >= 1),
  primary key (tenant_id, range_key, customer_key)
);
alter table private.customer_counters enable row level security;
revoke all on private.customer_counters from public, anon, authenticated;

-- Seed the marks from the existing invoices.
insert into private.customer_counters (tenant_id, range_key, customer_key, last_seq)
select
  i.tenant_id,
  coalesce(i.number_range_id, '00000000-0000-0000-0000-000000000000'::uuid),
  private.customer_key(i.customer_id, i.recipient),
  max(i.customer_seq)
from public.invoices i
where i.customer_seq is not null
group by 1, 2, 3;

-- Returns the counter for an invoice of the given group and records it in the high-water mark: the given manual
-- value (1..99999), or the next free automatic one when p_manual is null. Security definer because the table has
-- no grants; it checks the membership itself and only ever touches rows of p_tenant_id.
create function private.claim_customer_seq(p_tenant_id uuid, p_range_id uuid, p_customer_key text, p_manual int)
returns int
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_range_key uuid := coalesce(p_range_id, '00000000-0000-0000-0000-000000000000'::uuid);
  v_mark int;
  v_max int;
  v_seq int;
begin
  if p_tenant_id is null or not private.is_tenant_member(p_tenant_id) then
    raise exception 'access denied' using errcode = '42501';
  end if;
  if p_manual is not null and (p_manual < 1 or p_manual > 99999) then
    raise exception 'customer_seq must be between 1 and 99999' using errcode = '22023';
  end if;

  -- Serializes parallel saves of the same group until the transaction ends.
  perform pg_advisory_xact_lock(hashtextextended(p_tenant_id::text || '|' || v_range_key::text || '|' || p_customer_key, 0));

  if p_manual is not null then
    v_seq := p_manual;
  else
    select c.last_seq into v_mark
    from private.customer_counters c
    where c.tenant_id = p_tenant_id and c.range_key = v_range_key and c.customer_key = p_customer_key;
    select max(i.customer_seq) into v_max
    from public.invoices i
    where i.tenant_id = p_tenant_id
      and i.number_range_id is not distinct from p_range_id
      and private.customer_key(i.customer_id, i.recipient) = p_customer_key;
    v_seq := greatest(coalesce(v_mark, 0), coalesce(v_max, 0)) + 1;
  end if;

  insert into private.customer_counters (tenant_id, range_key, customer_key, last_seq)
  values (p_tenant_id, v_range_key, p_customer_key, v_seq)
  on conflict (tenant_id, range_key, customer_key)
  do update set last_seq = greatest(private.customer_counters.last_seq, excluded.last_seq);

  return v_seq;
end;
$$;
revoke all on function private.claim_customer_seq(uuid, uuid, text, int) from public, anon;
grant execute on function private.claim_customer_seq(uuid, uuid, text, int) to authenticated;

-- save_invoice: signature, security and grants unchanged; the payload may carry "customer_seq".
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
