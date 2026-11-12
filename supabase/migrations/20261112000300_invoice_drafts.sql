-- Invoices without a number yet ("Entwurf"): written during the month, numbered later, often all at once at the end
-- of the month. number null = draft. The app gives the number from the invoice's number range and sets the issue date
-- to the day the number is given; until then a draft cannot be exported.

alter table public.invoices alter column number drop not null;

-- Drafts are found by their recipient as well.
alter table public.invoices alter column search_text set expression as (
  lower(coalesce(number, '') || ' ' || coalesce(recipient ->> 'name', ''))
);

-- A number, once given, stays: taking it away would turn an issued invoice back into a draft and leave a gap.
create function private.invoices_keep_number() returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if old.number is not null and new.number is null then
    raise exception 'the number of an invoice cannot be removed' using errcode = '23514';
  end if;
  return new;
end;
$$;
revoke all on function private.invoices_keep_number() from public, anon, authenticated;
create trigger invoices_keep_number before update of number on public.invoices
  for each row execute function private.invoices_keep_number();
