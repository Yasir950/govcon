// Shapes returned by the team & social RPCs
// (20261001000500_team_social.sql). Shared by server and client code.

import type { HelpPerson, HelpRule } from "@/lib/member-help-types";

// ------------------------------------------------- company leaderboards

export interface CompanyBoardRow {
  position: number;
  company_id: string;
  name: string;
  slug: string;
  logo_url: string | null;
  logo_initials: string | null;
  score: number;
  active_employees: number;
  verified_employees: number;
  is_mine: boolean;
}

export interface CompanyBoardWinner extends CompanyBoardRow {
  month: string;
  month_label: string;
}

export interface CompanyBoard {
  month: string;
  label: string;
  finalized: boolean;
  is_current: boolean;
  min_active: number;
  rows: CompanyBoardRow[];
  mine: {
    company_id: string;
    name: string;
    slug: string;
    logo_url: string | null;
    logo_initials: string | null;
    position: number | null;
    score: number | null;
    active_employees: number;
    verified_employees: number;
    i_am_active: boolean;
  } | null;
  prizes: { rank: number; credits: number; top_badge: boolean }[];
  months: { month: string; label: string }[];
  winners: CompanyBoardWinner[];
}

export interface CompanySocialSummary {
  verified_employees: number;
  active_employees: number;
  position: number | null;
  score: number | null;
  min_active: number;
  month_label: string;
  domains: string[];
  top_company_months: { month: string; label: string }[];
  me: {
    company_id: string;
    company_name: string;
    company_slug: string;
    work_email: string;
    verified_at: string;
  } | null;
}

// --------------------------------------------------------- streak buddies

export interface BuddyPerson extends HelpPerson {
  streak_current: number;
  done_today: boolean;
}

export interface BuddyMilestone {
  days: number;
  xp: number;
  credits: number;
  badge_code: string | null;
}

export interface StreakBuddyState {
  buddy: {
    id: string;
    person: BuddyPerson;
    streak_current: number;
    streak_best: number;
    last_day: string | null;
    since: string | null;
    me_done_today: boolean;
    next_milestone: BuddyMilestone | null;
  } | null;
  incoming: { id: string; person: BuddyPerson; created_at: string }[];
  outgoing: { id: string; person: BuddyPerson; created_at: string } | null;
  day_xp: number | null;
  milestones: BuddyMilestone[];
}

// ----------------------------------------------------------- one-tap

export interface SkillEndorsement {
  skill: string;
  count: number;
  endorsed: boolean;
  endorsers: { id: string; name: string; avatar_url: string | null }[];
}

export interface ProfileSkillEndorsements {
  can_endorse: boolean;
  skills: SkillEndorsement[];
}

export type CelebrationKind = "new_role" | "anniversary";

export interface Celebration {
  key: string;
  kind: CelebrationKind;
  person: HelpPerson;
  title: string;
  company: string;
  years: number;
}

export interface NetworkCelebrations {
  items: Celebration[];
  rule: HelpRule | null;
}

export function celebrationText(c: Pick<Celebration, "kind" | "title" | "company" | "years">): string {
  if (c.kind === "new_role") return `Started a new role as ${c.title} at ${c.company}`;
  return `${c.years} ${c.years === 1 ? "year" : "years"} at ${c.company}`;
}
