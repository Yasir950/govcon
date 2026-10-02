-- Retires the legacy seeded `members` table entirely. It's dead weight
-- with zero real rows and zero real writers left (createPostAction never
-- wrote author_id) — keeping an always-empty legacy table/column around
-- contradicts the same "no fabricated data" doctrine driving this cleanup.
delete from public.members;
alter table public.posts drop constraint posts_has_an_author;
alter table public.posts alter column author_profile_id set not null;
alter table public.posts drop column author_id;
drop table public.members;
