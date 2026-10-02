-- Points, levels, quests, leaderboards and badges belong to Community only.
-- The Home feed is separate, so its activity stops earning. Rules are
-- deactivated (not deleted) so admins can see them at /admin/points and
-- past ledger rows keep their labels; XP already earned is left alone.

update public.point_rules set active = false
where action_type in ('feed_reaction', 'feed_comment', 'feed_post', 'repost_with_comment');

-- Quests that only a feed action could complete.
update public.quests set active = false where code in ('react_3', 'wb_react_1');

-- Mixed quests keep only their Community actions.
update public.quests set action_types = '{community_post}',
  title = 'Share an opportunity in a community with a comment on who it suits', link_path = 'community'
where code = 'share_opportunity';
update public.quests set action_types = '{community_post,community_comment}',
  title = 'Welcome back: post or comment in a community'
where code = 'wb_contribute';

-- Easy slot for the "welcome back" set now that wb_react_1 is gone.
insert into public.quests (code, title, difficulty, target_count, action_types, filters, requires, quest_set, link_path, sort_order)
values ('wb_vote_1', 'Welcome back: vote on 1 community post', 'easy', 1, '{community_vote_cast}', '{}', null, 'welcome_back', 'community', 205)
on conflict (code) do nothing;

-- Members already holding a feed quest for today get the Community
-- equivalent in the same (easy) slot so their Today card stays completable.
update public.user_daily_quests udq
set quest_id = nq.id, target_count = nq.target_count, progress = 0
from public.quests oq, public.quests nq
where udq.quest_id = oq.id
  and udq.completed_at is null
  and not udq.rerolled
  and udq.day >= current_date - 1
  and ((oq.code = 'react_3' and nq.code = 'vote_5') or (oq.code = 'wb_react_1' and nq.code = 'wb_vote_1'));
