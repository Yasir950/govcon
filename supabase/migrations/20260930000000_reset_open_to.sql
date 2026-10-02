-- "Open to" moved from 7 checkboxes to a 10-choice catalog (src/lib/open-to.ts).
-- Old selections are not carried over: clear them on every account so
-- members pick again from the new list.
update public.profiles set open_to = '{}' where cardinality(open_to) > 0;
