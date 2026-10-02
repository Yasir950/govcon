-- Reverses 20260929001000_points_community_only: Home feed activity earns
-- points again and the feed quests return to their original definitions.

update public.point_rules set active = true
where action_type in ('feed_reaction', 'feed_comment', 'feed_post', 'repost_with_comment');

update public.quests set active = true where code in ('react_3', 'wb_react_1');

update public.quests set action_types = '{feed_post,community_post,repost_with_comment}',
  title = 'Share an opportunity with a comment on who it suits', link_path = 'opportunities'
where code = 'share_opportunity';
update public.quests set action_types = '{community_post,community_comment,feed_post,feed_comment}',
  title = 'Welcome back: post or comment anywhere'
where code = 'wb_contribute';

-- wb_vote_1 only existed to replace wb_react_1; drop it if nobody holds it.
delete from public.quests q
where q.code = 'wb_vote_1'
  and not exists (select 1 from public.user_daily_quests u where u.quest_id = q.id);
update public.quests set active = false where code = 'wb_vote_1';
