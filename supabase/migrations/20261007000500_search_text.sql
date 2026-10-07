-- Generated, lower-cased search columns. The app filters with a single ilike on these columns,
-- so user input is never spliced into a PostgREST or() filter string.
alter table public.customers add column search_text text generated always as (
  lower(name || ' ' || coalesce(contact_person, '') || ' ' || city || ' ' || coalesce(email, ''))
) stored;

alter table public.articles add column search_text text generated always as (
  lower(name || ' ' || coalesce(description, '') || ' ' || unit)
) stored;
