-- Tables of the invoice app. Access control follows in 20261007000200_security.sql.

create function public.set_updated_at() returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- Schema "private" is NOT exposed via the Data API (config.toml: api.schemas = ["public"]).
create schema if not exists private;

-- Allow-list of users who may access the app's data.
create table private.members (
  user_id uuid primary key references auth.users (id) on delete cascade,
  created_at timestamptz not null default now()
);

-- Single-row settings table (company data, theme, numbering, file names).
create table public.settings (
  id smallint primary key default 1 check (id = 1),
  company jsonb not null default '{}'::jsonb,
  theme jsonb not null default '{}'::jsonb,
  number_format text default '{JJJJ}-{NNNN}',
  filename_template text not null default 'Rechnung_{Kunde}_{Nr}' check (length(filename_template) between 1 and 200),
  default_payment_days int not null default 14 check (default_payment_days between 0 and 365),
  updated_at timestamptz not null default now()
);
insert into public.settings (id) values (1);

create table public.customers (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(trim(name)) > 0),
  contact_person text,
  street text not null default '',
  postal_code text not null default '',
  city text not null default '',
  country_code char(2) not null default 'DE',
  email text,
  vat_id text,
  notes text,
  archived_at timestamptz,
  created_by uuid default auth.uid() references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Prices are gross (including VAT).
create table public.articles (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(trim(name)) > 0),
  description text,
  unit text not null default '',
  unit_price_gross numeric(12, 2) not null,
  vat_rate numeric(5, 2) not null check (vat_rate >= 0 and vat_rate < 100),
  archived_at timestamptz,
  created_by uuid default auth.uid() references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.invoices (
  id uuid primary key default gen_random_uuid(),
  number text not null unique check (length(trim(number)) > 0),
  customer_id uuid references public.customers (id) on delete set null,
  -- Snapshot of the recipient address at invoicing time (editable per invoice).
  recipient jsonb not null,
  issue_date date not null default current_date,
  service_date_from date not null,
  service_date_to date check (service_date_to is null or service_date_to >= service_date_from),
  payment_days int not null default 14 check (payment_days between 0 and 365),
  due_date date generated always as (issue_date + payment_days) stored,
  intro_text text,
  closing_text text,
  created_by uuid default auth.uid() references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index invoices_customer_id_idx on public.invoices (customer_id);
create index invoices_issue_date_idx on public.invoices (issue_date desc);

create table public.invoice_items (
  id uuid primary key default gen_random_uuid(),
  invoice_id uuid not null references public.invoices (id) on delete cascade,
  position int not null check (position >= 0),
  description text not null check (length(trim(description)) > 0),
  quantity numeric(12, 3) not null,
  unit text not null default '',
  unit_price_gross numeric(12, 2) not null,
  vat_rate numeric(5, 2) not null check (vat_rate >= 0 and vat_rate < 100),
  -- Origin reference only; values are copied into the item.
  article_id uuid references public.articles (id) on delete set null,
  unique (invoice_id, position)
);
create index invoice_items_article_id_idx on public.invoice_items (article_id);

-- Archived PDF exports (files live in the private "invoice-pdfs" bucket).
create table public.invoice_exports (
  id uuid primary key default gen_random_uuid(),
  invoice_id uuid not null references public.invoices (id) on delete cascade,
  storage_path text not null unique,
  filename text not null,
  created_by uuid default auth.uid() references auth.users (id) on delete set null,
  created_at timestamptz not null default now()
);
create index invoice_exports_invoice_id_idx on public.invoice_exports (invoice_id);

create trigger settings_updated_at before update on public.settings for each row execute function public.set_updated_at();
create trigger customers_updated_at before update on public.customers for each row execute function public.set_updated_at();
create trigger articles_updated_at before update on public.articles for each row execute function public.set_updated_at();
create trigger invoices_updated_at before update on public.invoices for each row execute function public.set_updated_at();
