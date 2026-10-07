-- Payment terms are optional: an invoice without payment days has no due date
-- (due_date = issue_date + payment_days is null then) and shows none on the document.
alter table public.invoices
  alter column payment_days drop not null,
  alter column payment_days drop default;

-- New invoices start without payment terms; a default can be set again in the settings.
alter table public.settings
  alter column default_payment_days drop not null,
  alter column default_payment_days set default null;
update public.settings set default_payment_days = null;
