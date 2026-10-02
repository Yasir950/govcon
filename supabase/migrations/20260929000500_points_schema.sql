-- Points & Rewards system (spec: "GovConUnited Points & Rewards System",
-- Sep 29 2026) — part 1 of 4: schema + admin-editable config + seeds.
--
-- Three balances: Reputation (given by other members), XP (own actions,
-- quests, streaks) and Credits (spendable). Everything is derived from an
-- append-only ledger (point_events); user_points is a cache of it that the
-- ledger's own trigger keeps in sync. Point values, caps, the quest pool,
-- badge thresholds and store prices all live in tables below so admins can
-- tune them from /admin/points without a deploy ("config, not code").

create extension if not exists pg_trgm with schema extensions;

-- ------------------------------------------------------------------ config

create table public.points_settings (
  key text primary key,
  value jsonb not null,
  description text,
  updated_at timestamptz not null default now()
);

insert into public.points_settings (key, value, description) values
  ('default_timezone', '"America/New_York"', 'Time zone used for a member''s day until they pick their own.'),
  ('daily_xp_cap', '200', 'Max repeatable (daily-action) XP per day, after the streak multiplier. Quests, streak bonuses and milestones are not counted.'),
  ('daily_rep_cap', '200', 'Max Rep a member can gain per day.'),
  ('quest_xp', '10', 'XP per completed daily quest.'),
  ('quest_credits', '2', 'Credits per completed daily quest.'),
  ('sweep_xp', '25', 'Bonus XP for completing all 3 daily quests.'),
  ('sweep_credits', '5', 'Bonus Credits for completing all 3 daily quests.'),
  ('free_rerolls', '1', 'Free quest rerolls per day.'),
  ('level4_free_rerolls', '2', 'Free quest rerolls per day from Level 4.'),
  ('streak_freeze_max', '2', 'Most Streak Freezes a member can hold.'),
  ('streak_repair_hours', '48', 'How long after losing a streak it can still be repaired.'),
  ('comeback_days_away', '14', 'Days away that trigger the comeback bonus.'),
  ('comeback_duration_days', '3', 'Days of double quest XP after coming back.'),
  ('downvotes_affect_rep', 'true', 'Open decision: do downvotes subtract Rep (true) or only affect ranking (false)?'),
  ('rep_public_min', '0', 'Open decision: Rep shows publicly once a member reaches this much (0 = from day one).'),
  ('rep_min_account_age_days', '7', 'Accounts younger than this (or without a verified email) give no Rep.'),
  ('vote_ring_share', '0.30', 'If one account casts more than this share of the votes another receives, those votes stop granting Rep.'),
  ('vote_ring_min_votes', '10', 'Vote-ring check only applies once the recipient has at least this many votes in the window.'),
  ('vote_ring_window_days', '30', 'Window for the vote-ring check.'),
  ('vote_settle_minutes', '10', 'A vote must stay in place this long before it earns XP.'),
  ('comment_min_chars', '20', 'Minimum comment length that earns XP.'),
  ('comment_duplicate_similarity', '0.8', 'Comments this similar to one of your own from the last 7 days earn nothing.'),
  ('post_reversal_days', '7', 'Deleting your own post within this many days reverses its XP.'),
  ('removal_rep_penalty', '10', 'Rep taken when a moderator removes content.'),
  ('connection_spam_ratio', '0.5', 'Share of ignored/declined requests in a week that pauses connection XP.'),
  ('connection_spam_min_requests', '4', 'Connection-spam check needs at least this many requests.'),
  ('connection_spam_pause_days', '7', 'Days connection XP stays paused.'),
  ('automation_votes', '15', 'Votes within automation_window_seconds that flag the account for review.'),
  ('automation_window_seconds', '30', 'Window for the automation check.'),
  ('invite_active_days', '7', 'Active days an invitee needs before the inviter is paid.'),
  ('earning_pause_days', '30', 'Days earning is paused by a penalty.'),
  ('legend_star_xp', '10000', 'XP per Legend star after Level 10.'),
  ('legend_star_credits', '100', 'Credits per Legend star.'),
  ('credit_expiry_inactive_months', '12', 'Credits expire after this many months of account inactivity.'),
  ('season_rep_weight', '3', 'Season Points = XP + Rep × this.'),
  ('top_contributor_min_members', '5', 'Communities need at least this many Rep earners before Top Contributor badges are given.'),
  ('public_launch_at', 'null', 'Accounts created before this timestamp get Founding Member (null = not launched yet, every account qualifies).'),
  ('weekend_bonus_xp', '5', 'Small bonus for streak activity on a weekend or federal holiday.');

create table public.point_rules (
  action_type text primary key,
  label text not null,
  -- daily: repeatable member actions (multiplier + 200/day cap apply)
  -- milestone: one-time profile/onboarding milestones
  -- rep: Reputation given by other members or moderators
  -- bonus: quests, streaks, level-ups, badges, challenges, seasons
  -- ledger: spending, refunds, admin adjustments, expiry
  -- track: zero-value events that only drive quests/challenges/streaks
  category text not null check (category in ('daily', 'milestone', 'rep', 'bonus', 'ledger', 'track')),
  xp int not null default 0,
  rep int not null default 0,
  credits int not null default 0,
  daily_cap int,
  monthly_cap int,
  counts_for_streak boolean not null default false,
  notes text,
  active boolean not null default true,
  sort_order int not null default 0
);

insert into public.point_rules (action_type, label, category, xp, rep, credits, daily_cap, monthly_cap, counts_for_streak, notes, sort_order) values
  ('daily_checkin', 'Daily check-in', 'daily', 5, 0, 0, 1, null, false, 'First visit of the day. Doesn''t keep a streak alive on its own.', 10),
  ('community_vote', 'Vote in Community', 'daily', 1, 0, 0, 15, null, false, 'Only votes that stay in place for 10+ minutes count.', 20),
  ('feed_reaction', 'React to a feed post', 'daily', 1, 0, 0, 10, null, false, null, 30),
  ('community_comment', 'Comment in Community', 'daily', 5, 0, 0, 6, null, true, '20+ characters; near-duplicates earn nothing; 1 XP-earning comment per post per day.', 40),
  ('feed_comment', 'Comment on a feed post', 'daily', 3, 0, 0, 5, null, true, '20+ characters.', 50),
  ('community_post', 'Create a Community post', 'daily', 10, 0, 0, 3, null, true, 'Removed within 7 days = XP reversed.', 60),
  ('feed_post', 'Create a feed post', 'daily', 5, 0, 0, 2, null, true, null, 70),
  ('repost_with_comment', 'Repost with your own comment', 'daily', 3, 0, 0, 3, null, true, 'A plain repost with no comment earns 0.', 80),
  ('connection_accepted', 'Connection request accepted', 'daily', 5, 0, 0, 10, null, false, 'Paid on acceptance, not on sending.', 90),
  ('company_follow', 'Follow a company', 'daily', 2, 0, 0, 5, null, false, null, 100),
  ('listing_save', 'Save an opportunity or job', 'daily', 1, 0, 0, 5, null, false, null, 110),
  ('event_rsvp', 'RSVP to an event', 'daily', 5, 0, 0, 3, null, false, null, 120),
  ('event_attended', 'Attend an event', 'daily', 25, 0, 0, 3, null, true, 'QR check-in or 10+ minutes in a virtual room.', 130),
  ('recommendation_written', 'Recommendation shown on the recipient''s profile', 'daily', 20, 0, 0, 2, null, false, 'Paid once the recipient accepts it.', 140),
  ('best_answer', 'Your answer is marked Best Answer', 'daily', 25, 15, 0, 5, null, false, 'Also earns 15 Rep (Rep is not capped by the XP cap).', 150),
  ('resource_approved', 'Resource submitted and approved', 'daily', 50, 0, 0, 2, null, false, null, 160),
  ('invite_completed', 'Invited member became active', 'daily', 50, 0, 0, null, 10, false, 'Invitee completes their profile and is active 7 days.', 170),
  ('weekend_bonus', 'Weekend / holiday activity bonus', 'bonus', 5, 0, 0, 1, null, false, 'Weekends never break a streak; activity there earns a small bonus.', 180),

  ('milestone_photo', 'Upload a profile photo', 'milestone', 20, 0, 5, null, null, false, null, 300),
  ('milestone_basics', 'Add headline, industry and location', 'milestone', 20, 0, 5, null, null, false, null, 310),
  ('milestone_experience', 'Add first experience entry', 'milestone', 20, 0, 5, null, null, false, null, 320),
  ('milestone_education', 'Add education', 'milestone', 10, 0, 0, null, null, false, null, 330),
  ('milestone_profile_complete', 'Profile reaches 100% complete', 'milestone', 100, 0, 25, null, null, false, null, 340),
  ('milestone_first_community_post', 'First Community post', 'milestone', 25, 0, 5, null, null, false, null, 350),
  ('milestone_first_comment', 'First comment', 'milestone', 15, 0, 5, null, null, false, null, 360),
  ('milestone_five_connections', 'First 5 connections', 'milestone', 50, 0, 10, null, null, false, null, 370),
  ('milestone_three_communities', 'Join 3 communities', 'milestone', 25, 0, 5, null, null, false, null, 380),
  ('milestone_clearance', 'Clearance verified', 'milestone', 50, 0, 10, null, null, false, null, 390),
  ('milestone_company_verified', 'Company page created and verified', 'milestone', 100, 0, 25, null, null, false, null, 400),
  ('milestone_first_event', 'First event attended', 'milestone', 50, 0, 10, null, null, false, null, 410),

  ('rep_post_upvote', 'Upvote on your Community post', 'rep', 0, 1, 0, null, null, false, null, 500),
  ('rep_comment_upvote', 'Upvote on your Community comment', 'rep', 0, 1, 0, null, null, false, null, 510),
  ('rep_post_downvote', 'Downvote on your Community post', 'rep', 0, -1, 0, null, null, false, 'Controlled by the downvotes_affect_rep setting.', 520),
  ('rep_comment_downvote', 'Downvote on your Community comment', 'rep', 0, -1, 0, null, null, false, 'Controlled by the downvotes_affect_rep setting.', 530),
  ('rep_recommendation', 'Recommendation received and shown', 'rep', 0, 25, 0, null, null, false, 'Maximum 1 per recommender.', 540),
  ('rep_featured', 'Your post featured by a moderator', 'rep', 0, 20, 0, null, null, false, null, 550),
  ('rep_removal_penalty', 'Content removed for breaking the rules', 'rep', 0, -10, 0, null, null, false, 'All Rep the content earned is reversed as well.', 560),

  ('quest_complete', 'Daily quest completed', 'bonus', 10, 0, 2, null, null, false, 'Values come from quest_xp / quest_credits.', 600),
  ('daily_sweep', 'Daily Sweep (all 3 quests)', 'bonus', 25, 0, 5, null, null, false, 'Values come from sweep_xp / sweep_credits.', 610),
  ('challenge_complete', 'Weekly challenge completed', 'bonus', 75, 0, 15, null, null, false, 'Values come from the challenge.', 620),
  ('streak_milestone', 'Streak milestone', 'bonus', 0, 0, 0, null, null, false, 'Values come from streak_milestones.', 630),
  ('level_up', 'Level up', 'bonus', 0, 0, 0, null, null, false, 'Values come from point_levels.', 640),
  ('legend_star', 'Legend star', 'bonus', 0, 0, 100, null, null, false, null, 650),
  ('badge_earned', 'Badge earned', 'bonus', 0, 0, 0, null, null, false, 'Credits come from the badge tier.', 660),
  ('season_reward', 'Season reward', 'bonus', 0, 0, 0, null, null, false, null, 670),

  ('redemption', 'Credits store redemption', 'ledger', 0, 0, 0, null, null, false, null, 700),
  ('redemption_refund', 'Redemption refund', 'ledger', 0, 0, 0, null, null, false, null, 710),
  ('admin_adjustment', 'Admin adjustment', 'ledger', 0, 0, 0, null, null, false, null, 720),
  ('credits_expired', 'Credits expired (12 months inactive)', 'ledger', 0, 0, 0, null, null, false, null, 730),
  ('points_reset', 'Points reset (penalty)', 'ledger', 0, 0, 0, null, null, false, null, 740),
  ('streak_freeze_used', 'Streak Freeze used', 'ledger', 0, 0, 0, null, null, false, null, 750),

  ('community_vote_cast', 'Voted in Community (quest tracking)', 'track', 0, 0, 0, null, null, false, null, 800),
  ('connection_request_sent', 'Connection request sent', 'track', 0, 0, 0, null, null, false, null, 810),
  ('connection_request_declined', 'Connection request declined', 'track', 0, 0, 0, null, null, false, null, 820),
  ('connection_made', 'New connection', 'track', 0, 0, 0, null, null, false, null, 830),
  ('recommendation_submitted', 'Recommendation written', 'track', 0, 0, 0, null, null, true, 'A contribution for streaks and quests; XP is paid on acceptance.', 840),
  ('upvote_received', 'Upvote received', 'track', 0, 0, 0, null, null, false, null, 850);

create table public.point_levels (
  level int primary key,
  rank_name text not null,
  xp_required int not null unique,
  credits_reward int not null default 0,
  pro_days int not null default 0,
  unlocks text
);

insert into public.point_levels (level, rank_name, xp_required, credits_reward, pro_days, unlocks) values
  (1, 'Registrant', 0, 0, 0, 'Basic participation'),
  (2, 'Bidder', 150, 10, 0, 'Rank shown on profile'),
  (3, 'Offeror', 500, 20, 0, 'Can downvote (stops brand-new accounts from pile-ons)'),
  (4, 'Subcontractor', 1200, 30, 0, 'Profile theme choices; 2nd daily quest reroll'),
  (5, 'Teaming Partner', 2500, 50, 0, 'Can nominate a Best Answer on any question with no accepted answer'),
  (6, 'Prime Contractor', 4500, 75, 0, 'Trusted reporter: reports go to the top of the moderation queue'),
  (7, 'Program Manager', 7500, 100, 0, 'Eligible to be invited as a community moderator'),
  (8, 'Capture Director', 12000, 150, 0, 'Can propose and host a community event or AMA'),
  (9, 'Contracting Officer', 18000, 200, 0, 'Early access to new features (beta group)'),
  (10, 'GovCon Legend', 25000, 300, 30, 'Legend flair on profile and posts; invitation to an annual member roundtable');

create table public.streak_milestones (
  days int primary key,
  xp int not null default 0,
  credits int not null default 0,
  badge_code text,
  multiplier numeric(4, 2) not null default 1.0,
  flair text
);

insert into public.streak_milestones (days, xp, credits, badge_code, multiplier, flair) values
  (3, 15, 0, null, 1.0, null),
  (5, 40, 10, null, 1.05, null),
  (10, 75, 15, 'streak_two_week', 1.1, null),
  (20, 150, 30, 'streak_monthly_regular', 1.15, null),
  (60, 400, 75, 'streak_quarter_close', 1.2, null),
  (125, 800, 150, 'streak_half_year', 1.25, null),
  (250, 2000, 300, 'streak_fiscal_year', 1.25, 'Fiscal Year');

-- Federal holidays count like weekends (never required for a streak).
-- Observed dates; admins add future years from /admin/points.
create table public.federal_holidays (
  day date primary key,
  name text not null
);

insert into public.federal_holidays (day, name) values
  ('2026-01-01', 'New Year''s Day'), ('2026-01-19', 'Martin Luther King Jr. Day'), ('2026-02-16', 'Washington''s Birthday'),
  ('2026-05-25', 'Memorial Day'), ('2026-06-19', 'Juneteenth'), ('2026-07-03', 'Independence Day (observed)'),
  ('2026-09-07', 'Labor Day'), ('2026-10-12', 'Columbus Day'), ('2026-11-11', 'Veterans Day'),
  ('2026-11-26', 'Thanksgiving Day'), ('2026-12-25', 'Christmas Day'),
  ('2027-01-01', 'New Year''s Day'), ('2027-01-18', 'Martin Luther King Jr. Day'), ('2027-02-15', 'Washington''s Birthday'),
  ('2027-05-31', 'Memorial Day'), ('2027-06-18', 'Juneteenth (observed)'), ('2027-07-05', 'Independence Day (observed)'),
  ('2027-09-06', 'Labor Day'), ('2027-10-11', 'Columbus Day'), ('2027-11-11', 'Veterans Day'),
  ('2027-11-25', 'Thanksgiving Day'), ('2027-12-24', 'Christmas Day (observed)'), ('2027-12-31', 'New Year''s Day (observed)'),
  ('2028-01-17', 'Martin Luther King Jr. Day'), ('2028-02-21', 'Washington''s Birthday'), ('2028-05-29', 'Memorial Day'),
  ('2028-06-19', 'Juneteenth'), ('2028-07-04', 'Independence Day'), ('2028-09-04', 'Labor Day'),
  ('2028-10-09', 'Columbus Day'), ('2028-11-10', 'Veterans Day (observed)'), ('2028-11-23', 'Thanksgiving Day'),
  ('2028-12-25', 'Christmas Day');

-- ------------------------------------------------------------------ quests

create table public.quests (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  title text not null,
  difficulty text not null check (difficulty in ('easy', 'medium', 'contribution')),
  target_count int not null default 1 check (target_count > 0),
  action_types text[] not null,
  -- Every key must match the action's metadata (see points_meta_matches):
  -- community_slug, naics_match, in_my_community, first_reply,
  -- top_industry, is_opportunity_share, is_connection, different_industry.
  filters jsonb not null default '{}'::jsonb,
  -- Eligibility: naics | industry | communities | connections | null.
  requires text check (requires in ('naics', 'industry', 'communities', 'connections')),
  quest_set text not null default 'standard' check (quest_set in ('standard', 'welcome_back')),
  weight int not null default 1 check (weight > 0),
  link_path text,
  active boolean not null default true,
  sort_order int not null default 0
);

insert into public.quests (code, title, difficulty, target_count, action_types, filters, requires, quest_set, link_path, sort_order) values
  ('vote_5', 'Vote on 5 posts in any community', 'easy', 5, '{community_vote_cast}', '{}', null, 'standard', 'community', 10),
  ('react_3', 'React to 3 feed posts', 'easy', 3, '{feed_reaction}', '{}', null, 'standard', 'dashboard', 20),
  ('save_naics_opp', 'Save 1 new opportunity that matches your NAICS codes', 'easy', 1, '{listing_save}', '{"naics_match": true}', 'naics', 'standard', 'opportunities', 30),
  ('follow_company', 'Follow 1 suggested company', 'easy', 1, '{company_follow}', '{}', null, 'standard', 'companies', 40),
  ('comment_my_community', 'Comment on a post in one of your communities', 'medium', 1, '{community_comment}', '{"in_my_community": true}', 'communities', 'standard', 'community', 50),
  ('reply_unanswered', 'Reply to a question with no answers yet', 'medium', 1, '{community_comment}', '{"first_reply": true}', null, 'standard', 'community', 60),
  ('connect_pymk', 'Send a connection request to someone in "People You May Know"', 'medium', 1, '{connection_request_sent}', '{}', null, 'standard', 'network', 70),
  ('rsvp_event', 'RSVP to an upcoming event', 'medium', 1, '{event_rsvp}', '{}', null, 'standard', 'events', 80),
  ('start_discussion', 'Start a discussion in a community you''ve joined', 'contribution', 1, '{community_post}', '{"in_my_community": true}', 'communities', 'standard', 'community', 90),
  ('answer_top_industry', 'Answer a question in your top industry', 'contribution', 1, '{community_comment}', '{"top_industry": true}', 'industry', 'standard', 'community', 100),
  ('write_recommendation', 'Write a recommendation for a connection', 'contribution', 1, '{recommendation_submitted}', '{"is_connection": true}', 'connections', 'standard', 'network', 110),
  ('share_opportunity', 'Share an opportunity with a comment on who it suits', 'contribution', 1, '{feed_post,community_post,repost_with_comment}', '{"is_opportunity_share": true}', null, 'standard', 'opportunities', 120),
  -- "Welcome back" set for members returning after 14+ days.
  ('wb_react_1', 'Welcome back: react to 1 feed post', 'easy', 1, '{feed_reaction}', '{}', null, 'welcome_back', 'dashboard', 200),
  ('wb_vote_3', 'Welcome back: vote on 3 community posts', 'medium', 3, '{community_vote_cast}', '{}', null, 'welcome_back', 'community', 210),
  ('wb_contribute', 'Welcome back: post or comment anywhere', 'contribution', 1, '{community_post,community_comment,feed_post,feed_comment}', '{}', null, 'welcome_back', 'community', 220);

create table public.user_daily_state (
  user_id uuid not null references public.profiles(id) on delete cascade,
  day date not null,
  checked_in_at timestamptz,
  streak_counted boolean not null default false,
  rerolls_used int not null default 0,
  extra_rerolls int not null default 0,
  sweep_at timestamptz,
  comeback boolean not null default false,
  created_at timestamptz not null default now(),
  primary key (user_id, day)
);

create table public.user_daily_quests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  day date not null,
  quest_id uuid not null references public.quests(id) on delete cascade,
  difficulty text not null,
  progress int not null default 0,
  target_count int not null,
  completed_at timestamptz,
  rerolled boolean not null default false,
  comeback boolean not null default false,
  created_at timestamptz not null default now()
);
create unique index user_daily_quests_slot_idx on public.user_daily_quests (user_id, day, difficulty) where not rerolled;
create index user_daily_quests_user_day_idx on public.user_daily_quests (user_id, day);

-- -------------------------------------------------------------- challenges

create table public.challenge_templates (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  title text not null,
  description text,
  -- [{"label": "...", "actions": ["..."], "target": 3, "filters": {...}}]
  requirements jsonb not null,
  xp int not null default 75,
  credits int not null default 15,
  active boolean not null default true,
  sort_order int not null default 0
);

insert into public.challenge_templates (code, title, description, requirements, sort_order) values
  ('capture_answers', 'Answer 3 questions in Capture & Proposal Strategy', 'Share what you know with members working on captures and proposals.',
    '[{"label": "Answer questions in Capture & Proposal Strategy", "actions": ["community_comment"], "target": 3, "filters": {"community_slug": "capture-proposal-strategy"}}]', 10),
  ('event_and_comment', 'Attend 1 event and comment on its recap', 'Show up, then keep the conversation going in a community.',
    '[{"label": "Attend an event", "actions": ["event_attended"], "target": 1, "filters": {}}, {"label": "Comment in a community", "actions": ["community_comment"], "target": 1, "filters": {}}]', 20),
  ('upvotes_10', 'Get 10 upvotes across your posts and comments', 'Post and answer things other members find useful.',
    '[{"label": "Upvotes received", "actions": ["upvote_received"], "target": 10, "filters": {}}]', 30),
  ('cross_industry_connections', 'Make 3 new connections with members in a different industry', 'Widen your network beyond your own industry.',
    '[{"label": "New connections in a different industry", "actions": ["connection_made"], "target": 3, "filters": {"different_industry": true}}]', 40),
  ('year_end_push', 'Year-End Push: share 2 opportunities with a note on who they suit', 'End-of-fiscal-year buying is here. Help members find the right fit.',
    '[{"label": "Opportunities shared with a comment", "actions": ["feed_post", "community_post", "repost_with_comment"], "target": 2, "filters": {"is_opportunity_share": true}}]', 50);

create table public.challenges (
  id uuid primary key default gen_random_uuid(),
  template_id uuid references public.challenge_templates(id) on delete set null,
  title text not null,
  description text,
  requirements jsonb not null,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  xp int not null default 75,
  credits int not null default 15,
  season_id uuid,
  created_at timestamptz not null default now(),
  check (ends_at > starts_at)
);
create index challenges_window_idx on public.challenges (starts_at, ends_at);

create table public.user_challenges (
  user_id uuid not null references public.profiles(id) on delete cascade,
  challenge_id uuid not null references public.challenges(id) on delete cascade,
  progress jsonb not null default '[]'::jsonb,
  completed_at timestamptz,
  primary key (user_id, challenge_id)
);

-- ------------------------------------------------------------------ badges

create table public.badges (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  family text not null,
  name text not null,
  description text,
  category text not null check (category in ('getting_started', 'streaks', 'community', 'reputation', 'networking', 'events', 'opportunities', 'trust', 'special', 'recognition', 'hidden')),
  tier text not null default 'single' check (tier in ('bronze', 'silver', 'gold', 'single')),
  -- Auto-awarded when points_metric(user, metric) >= threshold.
  metric text,
  threshold int,
  hidden boolean not null default false,
  manual boolean not null default false,
  per_community boolean not null default false,
  credits int not null default 0,
  icon text not null default 'medal',
  sort_order int not null default 0,
  active boolean not null default true
);

insert into public.badges (code, family, name, description, category, tier, metric, threshold, hidden, manual, per_community, credits, icon, sort_order) values
  ('onboarded', 'onboarded', 'Onboarded', 'Profile 100% complete', 'getting_started', 'bronze', 'profile_complete', 1, false, false, false, 10, 'check', 10),

  ('streak_two_week', 'streak', 'Two-Week Streak', '10-workday streak', 'streaks', 'single', 'streak_best', 10, false, false, false, 0, 'flame', 20),
  ('streak_monthly_regular', 'streak', 'Monthly Regular', '20-workday streak', 'streaks', 'single', 'streak_best', 20, false, false, false, 0, 'flame', 21),
  ('streak_quarter_close', 'streak', 'Quarter Close', '60-workday streak', 'streaks', 'single', 'streak_best', 60, false, false, false, 0, 'flame', 22),
  ('streak_half_year', 'streak', 'Half-Year Veteran', '125-workday streak', 'streaks', 'single', 'streak_best', 125, false, false, false, 0, 'flame', 23),
  ('streak_fiscal_year', 'streak', 'Fiscal Year', '250-workday streak', 'streaks', 'single', 'streak_best', 250, false, false, false, 0, 'flame', 24),

  ('daily_sweep_bronze', 'daily_sweep', 'Daily Sweep', 'All 3 quests done on 10 days', 'streaks', 'bronze', 'daily_sweeps', 10, false, false, false, 10, 'sweep', 30),
  ('daily_sweep_silver', 'daily_sweep', 'Daily Sweep', 'All 3 quests done on 50 days', 'streaks', 'silver', 'daily_sweeps', 50, false, false, false, 25, 'sweep', 31),
  ('daily_sweep_gold', 'daily_sweep', 'Daily Sweep', 'All 3 quests done on 150 days', 'streaks', 'gold', 'daily_sweeps', 150, false, false, false, 50, 'sweep', 32),

  ('contributor_bronze', 'contributor', 'Contributor', '10 Community posts', 'community', 'bronze', 'community_posts', 10, false, false, false, 10, 'pen', 40),
  ('contributor_silver', 'contributor', 'Contributor', '50 Community posts', 'community', 'silver', 'community_posts', 50, false, false, false, 25, 'pen', 41),
  ('contributor_gold', 'contributor', 'Contributor', '200 Community posts', 'community', 'gold', 'community_posts', 200, false, false, false, 50, 'pen', 42),
  ('conversationalist_bronze', 'conversationalist', 'Conversationalist', '50 Community comments', 'community', 'bronze', 'community_comments', 50, false, false, false, 10, 'chat', 50),
  ('conversationalist_silver', 'conversationalist', 'Conversationalist', '250 Community comments', 'community', 'silver', 'community_comments', 250, false, false, false, 25, 'chat', 51),
  ('conversationalist_gold', 'conversationalist', 'Conversationalist', '1,000 Community comments', 'community', 'gold', 'community_comments', 1000, false, false, false, 50, 'chat', 52),
  ('problem_solver_bronze', 'problem_solver', 'Problem Solver', '1 Best Answer', 'community', 'bronze', 'best_answers', 1, false, false, false, 10, 'bulb', 60),
  ('problem_solver_silver', 'problem_solver', 'Problem Solver', '10 Best Answers', 'community', 'silver', 'best_answers', 10, false, false, false, 25, 'bulb', 61),
  ('problem_solver_gold', 'problem_solver', 'Problem Solver', '50 Best Answers', 'community', 'gold', 'best_answers', 50, false, false, false, 50, 'bulb', 62),
  ('first_responder_bronze', 'first_responder', 'First Responder', 'First reply to 5 unanswered questions', 'community', 'bronze', 'first_responses', 5, false, false, false, 10, 'bolt', 70),
  ('first_responder_silver', 'first_responder', 'First Responder', 'First reply to 25 unanswered questions', 'community', 'silver', 'first_responses', 25, false, false, false, 25, 'bolt', 71),
  ('first_responder_gold', 'first_responder', 'First Responder', 'First reply to 100 unanswered questions', 'community', 'gold', 'first_responses', 100, false, false, false, 50, 'bolt', 72),

  ('well_regarded_bronze', 'well_regarded', 'Well Regarded', '100 Rep', 'reputation', 'bronze', 'rep_total', 100, false, false, false, 10, 'star', 80),
  ('well_regarded_silver', 'well_regarded', 'Well Regarded', '1,000 Rep', 'reputation', 'silver', 'rep_total', 1000, false, false, false, 25, 'star', 81),
  ('well_regarded_gold', 'well_regarded', 'Well Regarded', '5,000 Rep', 'reputation', 'gold', 'rep_total', 5000, false, false, false, 50, 'star', 82),
  ('top_contributor_bronze', 'top_contributor', 'Top Contributor', 'Top 10% by Rep in a community over 90 days', 'reputation', 'bronze', null, 10, false, false, true, 10, 'trophy', 90),
  ('top_contributor_silver', 'top_contributor', 'Top Contributor', 'Top 5% by Rep in a community over 90 days', 'reputation', 'silver', null, 5, false, false, true, 25, 'trophy', 91),
  ('top_contributor_gold', 'top_contributor', 'Top Contributor', 'Top 1% by Rep in a community over 90 days', 'reputation', 'gold', null, 1, false, false, true, 50, 'trophy', 92),

  ('connector_bronze', 'connector', 'Connector', '25 connections', 'networking', 'bronze', 'connections', 25, false, false, false, 10, 'link', 100),
  ('connector_silver', 'connector', 'Connector', '100 connections', 'networking', 'silver', 'connections', 100, false, false, false, 25, 'link', 101),
  ('connector_gold', 'connector', 'Connector', '500 connections', 'networking', 'gold', 'connections', 500, false, false, false, 50, 'link', 102),
  ('talent_scout_bronze', 'talent_scout', 'Talent Scout', '3 invited members active', 'networking', 'bronze', 'invites_active', 3, false, false, false, 10, 'scout', 110),
  ('talent_scout_silver', 'talent_scout', 'Talent Scout', '10 invited members active', 'networking', 'silver', 'invites_active', 10, false, false, false, 25, 'scout', 111),
  ('talent_scout_gold', 'talent_scout', 'Talent Scout', '25 invited members active', 'networking', 'gold', 'invites_active', 25, false, false, false, 50, 'scout', 112),
  ('endorser_bronze', 'endorser', 'Endorser', '3 recommendations written and shown', 'networking', 'bronze', 'recommendations_written', 3, false, false, false, 10, 'quote', 120),
  ('endorser_silver', 'endorser', 'Endorser', '10 recommendations written and shown', 'networking', 'silver', 'recommendations_written', 10, false, false, false, 25, 'quote', 121),
  ('endorser_gold', 'endorser', 'Endorser', '25 recommendations written and shown', 'networking', 'gold', 'recommendations_written', 25, false, false, false, 50, 'quote', 122),
  ('trusted_partner_bronze', 'trusted_partner', 'Trusted Partner', '3 recommendations received', 'networking', 'bronze', 'recommendations_received', 3, false, false, false, 10, 'handshake', 130),
  ('trusted_partner_silver', 'trusted_partner', 'Trusted Partner', '10 recommendations received', 'networking', 'silver', 'recommendations_received', 10, false, false, false, 25, 'handshake', 131),
  ('trusted_partner_gold', 'trusted_partner', 'Trusted Partner', '25 recommendations received', 'networking', 'gold', 'recommendations_received', 25, false, false, false, 50, 'handshake', 132),

  ('event_regular_bronze', 'event_regular', 'Event Regular', '3 events attended', 'events', 'bronze', 'events_attended', 3, false, false, false, 10, 'calendar', 140),
  ('event_regular_silver', 'event_regular', 'Event Regular', '10 events attended', 'events', 'silver', 'events_attended', 10, false, false, false, 25, 'calendar', 141),
  ('event_regular_gold', 'event_regular', 'Event Regular', '25 events attended', 'events', 'gold', 'events_attended', 25, false, false, false, 50, 'calendar', 142),
  ('opportunity_hunter_bronze', 'opportunity_hunter', 'Opportunity Hunter', '25 opportunities saved', 'opportunities', 'bronze', 'opportunities_saved', 25, false, false, false, 10, 'target', 150),
  ('opportunity_hunter_silver', 'opportunity_hunter', 'Opportunity Hunter', '100 opportunities saved', 'opportunities', 'silver', 'opportunities_saved', 100, false, false, false, 25, 'target', 151),
  ('opportunity_hunter_gold', 'opportunity_hunter', 'Opportunity Hunter', '500 opportunities saved', 'opportunities', 'gold', 'opportunities_saved', 500, false, false, false, 50, 'target', 152),

  ('verified_professional', 'verified_professional', 'Verified Professional', 'Clearance or identity verified', 'trust', 'single', 'verified_professional', 1, false, false, false, 10, 'shield', 160),
  ('verified_company', 'verified_company', 'Verified Company', 'Company page verified', 'trust', 'single', 'verified_company', 1, false, false, false, 10, 'building', 170),

  ('founding_member', 'founding_member', 'Founding Member', 'Joined before public launch', 'special', 'single', null, null, false, false, false, 10, 'flag', 180),
  ('member_anniversary', 'member_anniversary', 'Member Anniversary', 'Another year on GovConUnited', 'special', 'single', null, null, false, false, false, 10, 'cake', 190),
  ('season_top10_bronze', 'season_top10', 'Season Top 10', 'Top 10 on a quarterly season leaderboard', 'special', 'bronze', null, null, false, false, false, 0, 'podium', 200),
  ('season_top10_silver', 'season_top10', 'Season Top 10', 'Top 3 on a quarterly season leaderboard', 'special', 'silver', null, null, false, false, false, 0, 'podium', 201),
  ('season_top10_gold', 'season_top10', 'Season Top 10', '#1 on a quarterly season leaderboard', 'special', 'gold', null, null, false, false, false, 0, 'podium', 202),
  ('season_participant', 'season_participant', 'Season Participant', '20+ streak days in a season', 'special', 'single', null, null, false, false, false, 0, 'calendar', 210),

  ('community_moderator', 'community_moderator', 'Community Moderator', 'Awarded by admins', 'recognition', 'single', null, null, false, true, false, 0, 'gavel', 220),
  ('staff_pick', 'staff_pick', 'Staff Pick', 'Chosen by admins for an outstanding post or contribution', 'recognition', 'single', null, null, false, true, false, 0, 'sparkle', 230),

  ('night_shift', 'night_shift', 'Night Shift', 'A helpful answer posted between 10 pm and 5 am', 'hidden', 'single', null, null, true, false, false, 10, 'moon', 300),
  ('deadline_day', 'deadline_day', 'Deadline Day', 'Active on the last day of the federal fiscal year (Sept 30)', 'hidden', 'single', null, null, true, false, false, 10, 'clock', 310),
  ('cross_pollinator', 'cross_pollinator', 'Cross-Pollinator', 'Active in 5 different communities in one week', 'hidden', 'single', null, null, true, false, false, 10, 'flower', 320);

create table public.user_badges (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  badge_id uuid not null references public.badges(id) on delete cascade,
  community_id uuid references public.communities(id) on delete cascade,
  -- Distinguishes repeatable awards (anniversary year, season id).
  award_key text not null default '',
  earned_at timestamptz not null default now(),
  pinned boolean not null default false,
  revoked_at timestamptz,
  awarded_by uuid references public.profiles(id) on delete set null,
  note text
);
create unique index user_badges_unique_idx on public.user_badges (user_id, badge_id, coalesce(community_id, '00000000-0000-0000-0000-000000000000'::uuid), award_key);
create index user_badges_user_idx on public.user_badges (user_id) where revoked_at is null;

-- ----------------------------------------------------------- rewards store

create table public.rewards (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name text not null,
  description text,
  category text not null check (category in ('streak', 'quests', 'cosmetic', 'boost', 'events', 'pro')),
  price int not null check (price >= 0),
  limit_count int,
  limit_period text check (limit_period in ('day', 'week', 'month', 'year', 'ever')),
  -- Limit counted per target (e.g. "1 a month per company", "1 per event").
  limit_per_target boolean not null default false,
  target_type text check (target_type in ('post', 'company', 'listing', 'event')),
  duration_hours int,
  free_members_only boolean not null default false,
  pro_days int not null default 0,
  cosmetic_kind text check (cosmetic_kind in ('theme', 'frame')),
  cosmetic_value text,
  min_level int not null default 1,
  needs_review boolean not null default false,
  active boolean not null default true,
  sort_order int not null default 0
);

insert into public.rewards (code, name, description, category, price, limit_count, limit_period, limit_per_target, target_type, duration_hours, free_members_only, pro_days, cosmetic_kind, cosmetic_value, min_level, needs_review, sort_order) values
  ('streak_freeze', 'Streak Freeze', 'Automatically covers 1 missed workday. Hold up to 2.', 'streak', 30, null, null, false, null, null, false, 0, null, null, 1, false, 10),
  ('streak_repair', 'Streak repair', 'Restore a streak lost in the last 48 hours.', 'streak', 60, 1, 'month', false, null, null, false, 0, null, null, 1, false, 20),
  ('extra_reroll', 'Extra daily quest reroll', 'Swap one more quest today.', 'quests', 10, 1, 'day', false, null, null, false, 0, null, null, 1, false, 30),
  ('theme_classic', 'Profile theme: Classic Navy', 'Level 4 unlock. A navy accent for your profile header.', 'cosmetic', 0, 1, 'ever', false, null, null, false, 0, 'theme', 'navy', 4, false, 40),
  ('theme_capitol', 'Profile theme: Capitol Red', 'Level 4 unlock.', 'cosmetic', 0, 1, 'ever', false, null, null, false, 0, 'theme', 'red', 4, false, 41),
  ('theme_evergreen', 'Profile theme: Evergreen', 'Level 4 unlock.', 'cosmetic', 0, 1, 'ever', false, null, null, false, 0, 'theme', 'green', 4, false, 42),
  ('theme_midnight', 'Profile theme: Midnight', 'A deep midnight gradient header.', 'cosmetic', 50, 1, 'ever', false, null, null, false, 0, 'theme', 'midnight', 1, false, 43),
  ('theme_sunrise', 'Profile theme: Sunrise', 'A warm sunrise gradient header.', 'cosmetic', 100, 1, 'ever', false, null, null, false, 0, 'theme', 'sunrise', 1, false, 44),
  ('frame_silver', 'Banner frame: Silver', 'A silver frame around your profile banner.', 'cosmetic', 75, 1, 'ever', false, null, null, false, 0, 'frame', 'silver', 1, false, 50),
  ('frame_gold', 'Banner frame: Gold', 'A gold frame around your profile banner.', 'cosmetic', 150, 1, 'ever', false, null, null, false, 0, 'frame', 'gold', 1, false, 51),
  ('worth_a_read', 'Highlight a post in "Worth a read"', 'Show one of your community posts in that community''s "Worth a read" rail for 24 hours. Moderators can decline (Credits refunded).', 'boost', 100, 1, 'week', false, 'post', 24, false, 0, null, null, 1, true, 60),
  ('profile_boost', 'Profile boost in "People You May Know"', 'Appear first in "People You May Know" for 7 days, labeled Boosted.', 'boost', 150, 1, 'month', false, null, 168, false, 0, null, null, 1, false, 70),
  ('company_boost', 'Company boost in "Companies You May Like"', 'Feature a company you manage for 7 days, labeled Boosted.', 'boost', 200, 1, 'month', true, 'company', 168, false, 0, null, null, 1, false, 80),
  ('featured_listing', 'Featured opportunity or job listing', 'Feature a listing your company posted for 7 days, labeled Boosted.', 'boost', 300, 2, 'month', false, 'listing', 168, false, 0, null, null, 1, false, 90),
  ('event_discount', '10% off a paid GovConUnited event', 'A discount code for one paid GovConUnited event.', 'events', 250, 1, 'ever', true, 'event', null, false, 0, null, null, 1, false, 100),
  ('pro_trial_7d', '7-day Pro trial', 'For free members.', 'pro', 400, 1, 'year', false, null, null, true, 7, null, null, 1, false, 110),
  ('pro_month', '1 month of Pro', 'Adds 30 days of Pro.', 'pro', 1200, 1, 'year', false, null, null, false, 30, null, null, 1, false, 120);

create table public.redemptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  reward_id uuid not null references public.rewards(id),
  reward_code text not null,
  price int not null,
  status text not null default 'fulfilled' check (status in ('active', 'fulfilled', 'pending', 'declined', 'refunded', 'expired')),
  target_type text,
  target_id uuid,
  starts_at timestamptz not null default now(),
  expires_at timestamptz,
  meta jsonb not null default '{}'::jsonb,
  decided_by uuid references public.profiles(id) on delete set null,
  decided_at timestamptz,
  decline_reason text,
  created_at timestamptz not null default now()
);
create index redemptions_user_idx on public.redemptions (user_id, created_at desc);
create index redemptions_active_idx on public.redemptions (reward_code, status, expires_at);

-- ----------------------------------------------------------------- seasons

create table public.seasons (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name text not null,
  theme text,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  featured_challenge_code text,
  notified_7d_at timestamptz,
  notified_1d_at timestamptz,
  finalized_at timestamptz,
  check (ends_at > starts_at)
);

-- Federal fiscal quarters, boundaries at midnight Eastern.
insert into public.seasons (code, name, theme, starts_at, ends_at, featured_challenge_code) values
  ('FY27Q1', 'FY27 Q1', 'New Fiscal Year Kickoff', '2026-10-01 00:00 America/New_York', '2027-01-01 00:00 America/New_York', 'capture_answers'),
  ('FY27Q2', 'FY27 Q2', 'Capture Season', '2027-01-01 00:00 America/New_York', '2027-04-01 00:00 America/New_York', 'event_and_comment'),
  ('FY27Q3', 'FY27 Q3', 'Proposal Push', '2027-04-01 00:00 America/New_York', '2027-07-01 00:00 America/New_York', 'upvotes_10'),
  ('FY27Q4', 'FY27 Q4', 'Year-End Push', '2027-07-01 00:00 America/New_York', '2027-10-01 00:00 America/New_York', 'year_end_push');

create table public.season_results (
  season_id uuid not null references public.seasons(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  rank int,
  season_points int not null default 0,
  xp int not null default 0,
  rep int not null default 0,
  streak_days int not null default 0,
  reward text,
  spotlight boolean not null default false,
  primary key (season_id, user_id)
);

alter table public.challenges add constraint challenges_season_fk foreign key (season_id) references public.seasons(id) on delete set null;

-- ------------------------------------------------------------------ ledger

create table public.point_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  action_type text not null references public.point_rules(action_type),
  xp int not null default 0,
  rep int not null default 0,
  credits int not null default 0,
  source_type text,
  source_id uuid,
  actor_user_id uuid references public.profiles(id) on delete set null,
  community_id uuid references public.communities(id) on delete set null,
  -- Idempotency: one live event per (user, action, key). Retries and
  -- double-clicks never pay twice; a reversed event frees the key again.
  dedupe_key text not null,
  multiplier numeric(4, 2) not null default 1,
  -- The member's local calendar day when earned — caps are per local day.
  local_day date not null,
  meta jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  reversed_at timestamptz,
  reversal_reason text,
  reversed_by uuid references public.profiles(id) on delete set null
);
create unique index point_events_dedupe_idx on public.point_events (user_id, action_type, dedupe_key) where reversed_at is null;
create index point_events_user_day_idx on public.point_events (user_id, local_day, action_type);
create index point_events_user_created_idx on public.point_events (user_id, created_at desc);
create index point_events_source_idx on public.point_events (source_type, source_id);
create index point_events_community_idx on public.point_events (community_id, created_at) where community_id is not null;
create index point_events_created_idx on public.point_events (created_at);
create index point_events_actor_idx on public.point_events (actor_user_id, user_id, created_at) where actor_user_id is not null;

create table public.user_points (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  xp_total int not null default 0,
  rep_total int not null default 0,
  credits_balance int not null default 0,
  credits_earned int not null default 0,
  credits_spent int not null default 0,
  level int not null default 1,
  legend_stars int not null default 0,
  streak_current int not null default 0,
  streak_best int not null default 0,
  streak_freezes int not null default 0,
  last_streak_date date,
  streak_started_on date,
  streak_lost_value int,
  streak_lost_at timestamptz,
  timezone text not null default 'America/New_York',
  leaderboard_opt_out boolean not null default false,
  leaderboard_banned boolean not null default false,
  earning_paused_until timestamptz,
  connection_xp_paused_until timestamptz,
  comeback_until date,
  last_active_date date,
  last_ip text,
  profile_theme text,
  profile_frame text,
  notify_streak_risk boolean not null default true,
  notify_quests_ready boolean not null default false,
  notify_weekly_recap boolean not null default true,
  notify_rep boolean not null default true,
  notify_leaderboard boolean not null default true,
  notify_season boolean not null default true,
  last_rep_notified_at timestamptz not null default now(),
  streak_risk_notified_on date,
  quests_notified_on date,
  weekly_recap_sent_on date,
  top10_notified_week date,
  penalty_level int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index user_points_xp_idx on public.user_points (xp_total desc);

-- --------------------------------------------------- anti-gaming & admin

create table public.points_flags (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  related_user_id uuid references public.profiles(id) on delete cascade,
  kind text not null check (kind in ('vote_ring', 'automation', 'invite_same_ip', 'connection_spam', 'manual')),
  detail jsonb not null default '{}'::jsonb,
  status text not null default 'open' check (status in ('open', 'resolved', 'dismissed')),
  created_at timestamptz not null default now(),
  resolved_by uuid references public.profiles(id) on delete set null,
  resolved_at timestamptz,
  resolution text
);
create index points_flags_open_idx on public.points_flags (status, created_at desc);

create table public.points_admin_actions (
  id uuid primary key default gen_random_uuid(),
  admin_id uuid references public.profiles(id) on delete set null,
  user_id uuid references public.profiles(id) on delete cascade,
  action text not null,
  reason text not null check (char_length(btrim(reason)) > 0),
  detail jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index points_admin_actions_user_idx on public.points_admin_actions (user_id, created_at desc);

-- Emails the DB-side jobs want sent (streak at risk, weekly recap, season
-- ending). /api/cron/points-emails drains it through Resend.
create table public.points_email_outbox (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  kind text not null,
  subject text not null,
  title text not null,
  body text,
  cta_path text not null default 'rewards',
  cta_label text not null default 'Open Rewards',
  created_at timestamptz not null default now(),
  sent_at timestamptz,
  error text
);
create index points_email_outbox_pending_idx on public.points_email_outbox (created_at) where sent_at is null;

create table public.best_answer_nominations (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.posts(id) on delete cascade,
  comment_id uuid not null references public.post_comments(id) on delete cascade,
  nominator_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (comment_id, nominator_id)
);

create table public.event_attendance_pings (
  event_id uuid not null references public.events(id) on delete cascade,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  minute timestamptz not null,
  primary key (event_id, profile_id, minute)
);

-- ------------------------------------------------ columns on existing tables

alter table public.profiles
  add column invited_by uuid references public.profiles(id) on delete set null,
  add column signup_ip text,
  add column invite_rewarded_at timestamptz,
  add column pro_grant_until timestamptz,
  add column pro_granted_by_points boolean not null default false,
  add column suspended_at timestamptz,
  add column suspended_reason text;

alter table public.event_registrations
  add column attended_at timestamptz,
  add column attendance_method text check (attendance_method in ('qr', 'virtual', 'host'));

alter table public.events
  add column checkin_code text unique default encode(gen_random_bytes(6), 'hex');
update public.events set checkin_code = encode(gen_random_bytes(6), 'hex') where checkin_code is null;

alter table public.post_reports
  add column priority int not null default 0;

alter table public.resources
  add column submitted_by uuid references public.profiles(id) on delete set null;

alter table public.notification_preferences
  add column rewards_in_app boolean not null default true,
  add column rewards_email boolean not null default true;

-- --------------------------------------------------------------------- RLS

alter table public.points_settings enable row level security;
alter table public.point_rules enable row level security;
alter table public.point_levels enable row level security;
alter table public.streak_milestones enable row level security;
alter table public.federal_holidays enable row level security;
alter table public.quests enable row level security;
alter table public.challenge_templates enable row level security;
alter table public.challenges enable row level security;
alter table public.badges enable row level security;
alter table public.rewards enable row level security;
alter table public.seasons enable row level security;
alter table public.season_results enable row level security;

do $$
declare t text;
begin
  foreach t in array array['points_settings', 'point_rules', 'point_levels', 'streak_milestones', 'federal_holidays', 'quests',
                           'challenge_templates', 'challenges', 'badges', 'rewards', 'seasons', 'season_results'] loop
    execute format('create policy "Anyone can read %1$s" on public.%1$I for select to public using (true)', t);
    execute format('create policy "Admins manage %1$s" on public.%1$I for all to authenticated using (public.is_admin((select auth.uid()))) with check (public.is_admin((select auth.uid())))', t);
  end loop;
end $$;

alter table public.point_events enable row level security;
create policy "Members read their own point events" on public.point_events for select to authenticated
  using (user_id = (select auth.uid()) or public.is_admin((select auth.uid())));

alter table public.user_points enable row level security;
create policy "Members read their own points" on public.user_points for select to authenticated
  using (user_id = (select auth.uid()) or public.is_admin((select auth.uid())));

alter table public.user_daily_state enable row level security;
create policy "Members read their own daily state" on public.user_daily_state for select to authenticated
  using (user_id = (select auth.uid()) or public.is_admin((select auth.uid())));

alter table public.user_daily_quests enable row level security;
create policy "Members read their own quests" on public.user_daily_quests for select to authenticated
  using (user_id = (select auth.uid()) or public.is_admin((select auth.uid())));

alter table public.user_challenges enable row level security;
create policy "Members read their own challenge progress" on public.user_challenges for select to authenticated
  using (user_id = (select auth.uid()) or public.is_admin((select auth.uid())));

-- Earned badges are public (profiles show them); hidden ones only once earned,
-- which is exactly what a row here means.
alter table public.user_badges enable row level security;
create policy "Earned badges are public" on public.user_badges for select to public
  using (revoked_at is null or user_id = (select auth.uid()) or public.is_admin((select auth.uid())));

alter table public.redemptions enable row level security;
create policy "Members read their own redemptions" on public.redemptions for select to authenticated
  using (user_id = (select auth.uid()) or public.is_admin((select auth.uid())));

alter table public.points_flags enable row level security;
create policy "Admins read points flags" on public.points_flags for select to authenticated using (public.is_admin((select auth.uid())));

alter table public.points_admin_actions enable row level security;
create policy "Admins read points admin actions" on public.points_admin_actions for select to authenticated using (public.is_admin((select auth.uid())));

alter table public.points_email_outbox enable row level security;
create policy "Admins read points outbox" on public.points_email_outbox for select to authenticated using (public.is_admin((select auth.uid())));

alter table public.best_answer_nominations enable row level security;
create policy "Anyone can read best answer nominations" on public.best_answer_nominations for select to public using (true);

alter table public.event_attendance_pings enable row level security;
create policy "Members read their own attendance pings" on public.event_attendance_pings for select to authenticated
  using (profile_id = (select auth.uid()));

-- Live toasts / modals / streak counter.
alter publication supabase_realtime add table public.point_events;
alter publication supabase_realtime add table public.user_points;

-- Notifications: new rewards types + subject.
alter table public.notifications drop constraint notifications_type_check;
alter table public.notifications add constraint notifications_type_check check (type = any (array[
  'connection_request', 'connection_accepted', 'profile_followed', 'post_liked', 'post_commented', 'comment_reply', 'mention',
  'post_reposted', 'message_received', 'event_invitation', 'event_reminder', 'opportunity_alert', 'billing_event',
  'moderation_action', 'security_alert', 'job_application_received', 'application_status_changed', 'teaming_inquiry_received',
  'teaming_inquiry_accepted', 'teaming_inquiry_declined', 'welcome', 'company_submission_approved', 'company_submission_rejected',
  'company_deletion_requested', 'partner_application_status_changed', 'community_post_created', 'post_answer_accepted',
  'network_post_created', 'network_comment_created', 'followed_post_commented', 'company_post_created', 'company_job_posted',
  'company_opportunity_posted', 'company_followed', 'company_reviewed', 'company_review_responded', 'recommendation_requested',
  'recommendation_received', 'recommendation_shown', 'company_verification_approved', 'company_verification_rejected',
  'rewards_level_up', 'rewards_badge_earned', 'rewards_streak', 'rewards_quests_ready', 'rewards_weekly_recap', 'rewards_rep_received',
  'rewards_leaderboard', 'rewards_season', 'rewards_redemption', 'rewards_best_answer_nominated', 'rewards_penalty'
]::text[]));

alter table public.notifications drop constraint notifications_subject_type_check;
alter table public.notifications add constraint notifications_subject_type_check check (subject_type = any (array[
  'connection', 'post', 'comment', 'message', 'event', 'opportunity', 'billing', 'report', 'security', 'job', 'teaming_inquiry',
  'account', 'company', 'partner_inquiry', 'rewards'
]::text[]));

-- notification_send_context() gains the rewards category (read by
-- createNotification for app-side rewards notifications).
drop function public.notification_send_context(uuid);
create function public.notification_send_context(target_profile_id uuid)
returns table(email text, first_name text, connections_in_app boolean, connections_email boolean, posts_in_app boolean, posts_email boolean,
  messages_in_app boolean, messages_email boolean, events_in_app boolean, events_email boolean, opportunities_in_app boolean,
  opportunities_email boolean, billing_in_app boolean, billing_email boolean, moderation_in_app boolean, moderation_email boolean,
  security_in_app boolean, security_email boolean, jobs_in_app boolean, jobs_email boolean, teaming_in_app boolean, teaming_email boolean,
  account_in_app boolean, account_email boolean, following_in_app boolean, following_email boolean, rewards_in_app boolean, rewards_email boolean)
language sql
stable security definer
set search_path to 'public'
as $$
  select
    p.email, p.first_name,
    coalesce(np.connections_in_app, true), coalesce(np.connections_email, true),
    coalesce(np.posts_in_app, true), coalesce(np.posts_email, true),
    coalesce(np.messages_in_app, true), coalesce(np.messages_email, true),
    coalesce(np.events_in_app, true), coalesce(np.events_email, true),
    coalesce(np.opportunities_in_app, true), coalesce(np.opportunities_email, true),
    coalesce(np.billing_in_app, true), coalesce(np.billing_email, true),
    coalesce(np.moderation_in_app, true), coalesce(np.moderation_email, true),
    coalesce(np.security_in_app, true), coalesce(np.security_email, true),
    coalesce(np.jobs_in_app, true), coalesce(np.jobs_email, true),
    coalesce(np.teaming_in_app, true), coalesce(np.teaming_email, true),
    coalesce(np.account_in_app, true), coalesce(np.account_email, true),
    coalesce(np.following_in_app, true), coalesce(np.following_email, true),
    coalesce(np.rewards_in_app, true), coalesce(np.rewards_email, true)
  from public.profiles p
  left join public.notification_preferences np on np.profile_id = p.id
  where p.id = target_profile_id
$$;
grant execute on function public.notification_send_context(uuid) to authenticated, anon;
