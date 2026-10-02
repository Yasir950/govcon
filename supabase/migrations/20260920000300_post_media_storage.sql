-- Mirrors is_admin(uid): security definer + fixed search_path so it can
-- read profiles regardless of the calling role's own RLS visibility,
-- reused as the real server-side enforcement point for Pro-only video
-- uploads (not just a UI gate).
create or replace function public.is_pro(uid uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select coalesce((select plan_selection = 'pro' from public.profiles where id = uid), false);
$$;

grant execute on function public.is_pro(uuid) to anon, authenticated;

-- Two buckets (not one) because image/video need different
-- file_size_limit/allowed_mime_types, and only video needs the Pro-plan
-- RLS gate. Path convention mirrors the existing avatars/<user_id>/...
-- bucket exactly: post-images/<profile_id>/<uuid>.<ext>.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('post-images', 'post-images', true, 10485760, array['image/jpeg', 'image/png', 'image/webp', 'image/gif'])
on conflict (id) do nothing;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('post-videos', 'post-videos', true, 209715200, array['video/mp4', 'video/quicktime', 'video/webm'])
on conflict (id) do nothing;

create policy "post-images publicly readable"
  on storage.objects for select
  to anon, authenticated
  using (bucket_id = 'post-images');

create policy "Members upload their own post images"
  on storage.objects for insert
  to authenticated
  with check (bucket_id = 'post-images' and (storage.foldername(name))[1] = (select auth.uid())::text);

create policy "Members delete their own post images"
  on storage.objects for delete
  to authenticated
  using (bucket_id = 'post-images' and (storage.foldername(name))[1] = (select auth.uid())::text);

create policy "post-videos publicly readable"
  on storage.objects for select
  to anon, authenticated
  using (bucket_id = 'post-videos');

create policy "Only Pro members can upload post videos"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'post-videos'
    and (storage.foldername(name))[1] = (select auth.uid())::text
    and public.is_pro((select auth.uid()))
  );

create policy "Members delete their own post videos"
  on storage.objects for delete
  to authenticated
  using (bucket_id = 'post-videos' and (storage.foldername(name))[1] = (select auth.uid())::text);
