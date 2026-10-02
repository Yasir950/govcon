-- LinkedIn-style messaging redesign: real image attachments in direct
-- messages (the UI's photo-attach button previously didn't exist at all).
alter table public.messages add column image_url text;

-- Mirrors post-images exactly: public read, each member can only
-- write/delete inside their own <profile_id>/ folder.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('message-images', 'message-images', true, 10485760, array['image/jpeg', 'image/png', 'image/webp', 'image/gif'])
on conflict (id) do nothing;

create policy "message-images publicly readable"
  on storage.objects for select
  to anon, authenticated
  using (bucket_id = 'message-images');

create policy "Members upload their own message images"
  on storage.objects for insert
  to authenticated
  with check (bucket_id = 'message-images' and (storage.foldername(name))[1] = (select auth.uid())::text);

create policy "Members delete their own message images"
  on storage.objects for delete
  to authenticated
  using (bucket_id = 'message-images' and (storage.foldername(name))[1] = (select auth.uid())::text);
