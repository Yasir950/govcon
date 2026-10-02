// Shapes returned by the daily-work-habit RPCs
// (20261001000200_daily_work_habits.sql). Shared by server and client code.

export type MatchDecision = "save" | "dismiss";

export interface OpportunityMatch {
  id: string;
  opportunity_id: string;
  slug: string;
  title: string;
  agency: string | null;
  office: string | null;
  naics_code: string;
  set_aside: string | null;
  notice_type: string | null;
  location: string | null;
  response_deadline: string | null;
  posted_date: string | null;
  reasons: string[];
  opened: boolean;
  decision: MatchDecision | null;
}

export interface DailyMatches {
  day: string;
  is_workday: boolean;
  has_naics: boolean;
  reviewed: boolean;
  rewarded: boolean;
  reward_xp: number;
  reward_credits: number;
  matches: OpportunityMatch[];
}

export interface MatchDecisionResult {
  reviewed: boolean;
  rewarded: boolean;
  rushed?: boolean;
  remaining?: number;
}

export interface QuestionOption {
  id: string;
  label: string;
  // Only present once the viewer has voted.
  votes: number | null;
}

export interface DailyQuestion {
  id: string;
  question: string;
  day: string;
  options: QuestionOption[];
  my_vote: string | null;
  total: number | null;
  suggested_by: { id: string; name: string; slug: string | null } | null;
}

export interface QuestionOfTheDay {
  question: DailyQuestion | null;
  vote_xp: number;
  pending_suggestions: number;
  max_pending_suggestions: number;
}
