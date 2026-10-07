-- Private buckets: "assets" (logo, custom fonts) and "invoice-pdfs" (archived PDF exports).
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types) values
  ('assets', 'assets', false, 2097152, array['image/png', 'image/jpeg', 'font/ttf']),
  ('invoice-pdfs', 'invoice-pdfs', false, 10485760, array['application/pdf']);

-- Only members may read or write objects in the app's buckets.
create policy members_select on storage.objects for select to authenticated
  using (bucket_id in ('assets', 'invoice-pdfs') and (select private.is_member()));
create policy members_insert on storage.objects for insert to authenticated
  with check (bucket_id in ('assets', 'invoice-pdfs') and (select private.is_member()));
create policy members_update on storage.objects for update to authenticated
  using (bucket_id in ('assets', 'invoice-pdfs') and (select private.is_member()))
  with check (bucket_id in ('assets', 'invoice-pdfs') and (select private.is_member()));
create policy members_delete on storage.objects for delete to authenticated
  using (bucket_id in ('assets', 'invoice-pdfs') and (select private.is_member()));
