-- posts.votes was seeded with arbitrary marketing numbers (128, 94, 76) back
-- when this table was first created, before post_votes existed to track
-- real per-user votes. Reset to the actual count of real votes cast so far
-- (zero — no one has voted yet), so the number on screen is genuinely real
-- from here on, not leftover fake seed data.
update public.posts set votes = 0;
