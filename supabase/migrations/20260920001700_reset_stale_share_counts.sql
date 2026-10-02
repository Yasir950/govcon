-- share_count used to be incremented by the retired post_shares table
-- (one row per plain "Share" click, no undo). Reposting now owns that
-- column instead, driven by real repost post rows, but existing values
-- from the old system were never reset — this brings every post's
-- share_count back in line with its real repost count (0, since no real
-- reposts existed before this feature), matching sync_post_repost_count's
-- own accounting exactly instead of carrying over stale pre-migration data.
update public.posts p
set share_count = (select count(*) from public.posts r where r.repost_of_post_id = p.id)
where share_count <> (select count(*) from public.posts r where r.repost_of_post_id = p.id);
