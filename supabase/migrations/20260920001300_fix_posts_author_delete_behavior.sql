-- Fixes a real latent bug: posts_author_profile_id_fkey was still ON
-- DELETE SET NULL from when author_profile_id was nullable
-- (20260918000600_real_post_authorship.sql). retire_members_table.sql
-- made the column NOT NULL but never updated the FK's delete action, so
-- deleting ANY real account with posts would fail with a not-null
-- constraint violation (found while cleaning up throwaway test accounts).
-- A post can no longer exist without a real author, so cascading the
-- delete is the only correct behavior now.
alter table public.posts drop constraint posts_author_profile_id_fkey;
alter table public.posts
  add constraint posts_author_profile_id_fkey
  foreign key (author_profile_id) references public.profiles(id) on delete cascade;
