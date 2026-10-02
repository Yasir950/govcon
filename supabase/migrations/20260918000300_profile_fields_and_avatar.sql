-- Real profile completeness fields the dashboard home design shows
-- (job title, location, company name, photo) — none of these existed on
-- `profiles` before; they were either hidden or shown as generic
-- "GovConUnited Member" text. All nullable/optional: a member who hasn't
-- filled them in just shows nothing, never an invented value.
alter table public.profiles
  add column job_title text,
  add column location text,
  add column company_name text,
  add column avatar_url text;

-- Real avatar photo storage. Public read (avatars are shown to other
-- members/visitors everywhere a profile appears), write restricted to the
-- owner's own folder (avatars/<user_id>/...).
insert into storage.buckets (id, name, public)
values ('avatars', 'avatars', true)
on conflict (id) do nothing;

create policy "Avatar images are publicly readable"
  on storage.objects for select
  to anon, authenticated
  using (bucket_id = 'avatars');

create policy "Users can upload their own avatar"
  on storage.objects for insert
  to authenticated
  with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid())::text);

create policy "Users can replace their own avatar"
  on storage.objects for update
  to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid())::text)
  with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid())::text);

create policy "Users can delete their own avatar"
  on storage.objects for delete
  to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid())::text);
