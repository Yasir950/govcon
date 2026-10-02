// Shapes returned by the Points & Rewards RPCs (see lib/points.ts). Kept
// separate from lib/points.ts so client components can import them.

// "bonus" is the weekly mystery quest (summary.bonus_quest, never in quests).
export type QuestDifficulty = "easy" | "medium" | "contribution" | "bonus";

export interface DailyQuest {
  id: string;
  title: string;
  difficulty: QuestDifficulty;
  progress: number;
  target: number;
  completed: boolean;
  link: string | null;
  comeback: boolean;
}

export interface DoubleXpHour {
  id: string;
  starts_at: string;
  ends_at: string;
  multiplier: number;
}

export interface SurpriseRewards {
  double_xp_enabled: boolean;
  double_xp_multiplier: number;
  double_xp_per_week_min: number;
  double_xp_per_week_max: number;
  lucky_drop_enabled: boolean;
  lucky_drop_chance: number;
  lucky_drop_min: number;
  lucky_drop_max: number;
  mystery_quest_enabled: boolean;
  mystery_xp: number | null;
  mystery_credits: number | null;
}

export interface ChallengeRequirement {
  label: string;
  target: number;
  progress: number;
}

export interface WeeklyChallenge {
  id: string;
  title: string;
  description: string | null;
  starts_at: string;
  ends_at: string;
  xp: number;
  credits: number;
  completed: boolean;
  requirements: ChallengeRequirement[];
}

export interface LeaderboardRow {
  position: number;
  user_id: string;
  score: number;
  name: string | null;
  avatar_url: string | null;
  headline: string | null;
  level: number;
  rank_name: string;
  is_me: boolean;
}

export type LeaderboardBoard = "weekly" | "community" | "answerers" | "season" | "network";

export interface LeaderboardResult {
  rows: LeaderboardRow[];
  me: { score: number; position: number } | null;
  label: string;
  board: LeaderboardBoard;
  season?: { code: string; name: string; theme: string | null; starts_at: string; ends_at: string } | null;
}

export interface PointsSummary {
  user_id: string;
  xp: number;
  rep: number;
  credits: number;
  credits_earned: number;
  credits_spent: number;
  level: number;
  rank: string;
  level_xp: number;
  next_level: number | null;
  next_rank: string | null;
  next_xp: number | null;
  next_unlocks: string | null;
  legend_stars: number;
  streak: number;
  streak_best: number;
  freezes: number;
  freeze_max: number;
  streak_done_today: boolean | null;
  streak_lost_value: number | null;
  multiplier: number;
  today: string;
  is_workday: boolean;
  comeback_until: string | null;
  comeback_active: boolean;
  daily_xp: number;
  daily_xp_cap: number;
  quests: DailyQuest[];
  quests_done: number;
  rerolls_left: number;
  // Free rerolls a day at the member's level (extras bought today add to rerolls_left).
  free_rerolls?: number;
  extra_reroll_price?: number | null;
  quest_rewards?: { quest_xp: number; quest_credits: number; sweep_xp: number; sweep_credits: number };
  // Surprise bonuses: this week's mystery quest (when it's today), today's
  // Lucky drop roll, and the live Double XP hour.
  bonus_quest?: DailyQuest | null;
  lucky_drop?: { won: boolean; credits: number } | null;
  double_xp?: DoubleXpHour | null;
  surprise_rewards?: SurpriseRewards;
  challenge: WeeklyChallenge | null;
  week_board: LeaderboardResult;
  timezone: string;
  leaderboard_opt_out: boolean;
  profile_theme: string | null;
  profile_frame: string | null;
  // Themes/frames the member owns (Level 4 unlocks + purchases); never shrinks.
  owned_cosmetics?: { themes: string[]; frames: string[] };
  earning_paused_until: string | null;
  notify: {
    streak_risk: boolean;
    quests_ready: boolean;
    weekly_recap: boolean;
    rep: boolean;
    leaderboard: boolean;
    season: boolean;
  };
}

export interface EarnedBadge {
  id: string;
  code: string;
  family: string;
  name: string;
  tier: "bronze" | "silver" | "gold" | "single";
  icon: string;
  category: string;
  description: string | null;
  hidden: boolean;
  earned_at: string;
  pinned: boolean;
  community_id: string | null;
  community_name: string | null;
  award_key: string;
}

export interface NextBadge {
  code: string;
  name: string;
  tier: EarnedBadge["tier"];
  icon: string;
  description: string | null;
  value: number;
  threshold: number;
}

export interface PointsProfile {
  user_id: string;
  is_owner?: boolean;
  level: number;
  rank: string;
  legend_stars?: number;
  is_legend?: boolean;
  xp?: number | null;
  level_xp?: number | null;
  next_xp?: number | null;
  next_rank?: string | null;
  rep: number | null;
  streak: number;
  streak_best?: number;
  streak_flair?: string | null;
  is_beta?: boolean;
  moderator_eligible?: boolean;
  profile_theme?: string | null;
  profile_frame?: string | null;
  badges: EarnedBadge[];
  pinned: EarnedBadge[];
  next_badges?: NextBadge[];
  hidden_total: number;
  hidden_earned: number;
}

export interface PinnedBadge {
  code: string;
  name: string;
  tier: EarnedBadge["tier"];
  icon: string;
  description: string | null;
}

export interface PublicPointsSummary {
  user_id: string;
  level: number;
  rank_name: string;
  rep: number | null;
  streak: number;
  legend_stars: number;
  is_legend: boolean;
  top_contributor: "bronze" | "silver" | "gold" | null;
  pinned: PinnedBadge[];
  profile_theme: string | null;
  profile_frame: string | null;
}

export interface RewardItem {
  id: string;
  code: string;
  name: string;
  description: string | null;
  category: "streak" | "quests" | "cosmetic" | "boost" | "events" | "pro" | "resources" | "expert" | "partner";
  price: number;
  limit_count: number | null;
  limit_period: "day" | "week" | "month" | "quarter" | "year" | "ever" | null;
  limit_per_target: boolean;
  target_type: "post" | "company" | "listing" | "event" | null;
  duration_hours: number | null;
  free_members_only: boolean;
  pro_days: number;
  cosmetic_kind: "theme" | "frame" | null;
  cosmetic_value: string | null;
  min_level: number;
  needs_review: boolean;
  fulfilment: "download" | "expert_review" | "expert_call" | "partner_code" | "event_ticket" | null;
  turnaround_days: number | null;
}

// store_status(): availability per reward code, for rewards with a
// fulfilment kind or a stock cap.
export interface StoreItemStatus {
  unavailable?: "coming_soon" | "sold_out";
  stock_left?: number;
  stock_period?: "quarter" | "year";
  resets_on?: string;
  partner?: { name: string; slug: string | null; logo_url: string | null };
  partner_url?: string;
}
export type StoreStatus = Record<string, StoreItemStatus>;

export interface StorePerson {
  id: string;
  name: string;
  avatar_url?: string | null;
  headline?: string | null;
}

// An expert review or call (store_request_json).
export interface ExpertRequest {
  redemption_id: string;
  kind: "review" | "call";
  status: "open" | "assigned" | "scheduled" | "delivered" | "cancelled";
  reward: string | null;
  member: StorePerson;
  expert: StorePerson | null;
  notes: string | null;
  file_path: string | null;
  file_name: string | null;
  link_url: string | null;
  availability: string | null;
  due_at: string | null;
  assigned_at: string | null;
  scheduled_at: string | null;
  meeting_url: string | null;
  feedback: string | null;
  feedback_file_path: string | null;
  feedback_file_name: string | null;
  delivered_at: string | null;
  created_at: string;
}

export interface RedemptionEntry {
  id: string;
  rewardCode: string;
  rewardName: string;
  price: number;
  status: string;
  targetType: string | null;
  targetId: string | null;
  expiresAt: string | null;
  meta: Record<string, unknown>;
  createdAt: string;
  declineReason: string | null;
}

export interface PointsHistoryEntry {
  id: string;
  actionType: string;
  label: string;
  xp: number;
  rep: number;
  credits: number;
  meta: Record<string, unknown>;
  createdAt: string;
  reversedAt: string | null;
  reversalReason: string | null;
  multiplier: number;
}

export interface BadgeDefinition {
  id: string;
  code: string;
  family: string;
  name: string;
  description: string | null;
  category: string;
  tier: EarnedBadge["tier"];
  metric: string | null;
  threshold: number | null;
  hidden: boolean;
  manual: boolean;
  per_community: boolean;
  credits: number;
  icon: string;
  sort_order: number;
}

export interface LevelDefinition {
  level: number;
  rank_name: string;
  xp_required: number;
  credits_reward: number;
  pro_days: number;
  unlocks: string | null;
}

export interface PointRule {
  action_type: string;
  label: string;
  category: "daily" | "milestone" | "rep" | "bonus" | "ledger" | "track";
  xp: number;
  rep: number;
  credits: number;
  daily_cap: number | null;
  monthly_cap: number | null;
  counts_for_streak: boolean;
  notes: string | null;
}

export interface WorthAReadEntry {
  redemptionId: string;
  postId: string;
  slug: string;
  title: string;
  body: string;
  authorId: string | null;
  authorName: string | null;
  expiresAt: string;
}

// Profile themes (see rewards.cosmetic_value). A theme only tints the header
// band behind the member's name and photo: `band` is light enough that the
// normal dark text stays readable. `swatch` is the theme's identity color,
// used for previews in the store and Settings.
export const PROFILE_THEMES: Record<string, { label: string; swatch: string; band: string }> = {
  navy: {
    label: "Classic Navy",
    swatch: "linear-gradient(135deg, #0b1f4b 0%, #1d3a7a 100%)",
    band: "linear-gradient(180deg, #dfe6f3 0%, #f3f6fb 100%)",
  },
  red: {
    label: "Capitol Red",
    swatch: "linear-gradient(135deg, #8f1016 0%, #ed1c24 100%)",
    band: "linear-gradient(180deg, #f8dcdd 0%, #fdf3f3 100%)",
  },
  green: {
    label: "Evergreen",
    swatch: "linear-gradient(135deg, #0f3d2e 0%, #1f7a55 100%)",
    band: "linear-gradient(180deg, #dcefe5 0%, #f2f9f5 100%)",
  },
  midnight: {
    label: "Midnight",
    swatch: "linear-gradient(135deg, #05060f 0%, #23265a 60%, #4b2c7a 100%)",
    band: "linear-gradient(180deg, #e2e0f2 0%, #f4f3fa 100%)",
  },
  sunrise: {
    label: "Sunrise",
    swatch: "linear-gradient(135deg, #f7971e 0%, #ffd200 50%, #ed1c24 100%)",
    band: "linear-gradient(180deg, #fde7cf 0%, #fff7ea 100%)",
  },
};

export const PROFILE_FRAMES: Record<string, { label: string; color: string }> = {
  silver: { label: "Silver", color: "#aeb6c2" },
  gold: { label: "Gold", color: "#d4a017" },
};

export const TIER_COLORS: Record<EarnedBadge["tier"], string> = {
  bronze: "#b0703c",
  silver: "#8a96a8",
  gold: "#d4a017",
  single: "#1d3a7a",
};

// The one streak rule, shown everywhere it's explained (nav tooltip and
// How points work). Mirrors the counts_for_streak rules plus quest_complete
// in the engine; keep them in step.
export const STREAK_ACTIONS_SHORT = "Post, comment, vote, react or finish a quest";
export const STREAK_RULE =
  "Any one of these on a workday keeps your streak: posting, commenting, voting, reacting, reposting with a comment, attending an event, writing a recommendation or finishing a daily quest. Checking in alone doesn't count. Weekends and federal holidays never break it.";
