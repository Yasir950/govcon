-- Lets a comment carry an optional image/gif attachment, reusing the
-- existing public "post-images" bucket (already allows image/gif and is
-- already folder-scoped to the uploader's own profile id) rather than
-- introducing a new bucket or RLS pattern.
alter table public.post_comments add column if not exists image_url text;
