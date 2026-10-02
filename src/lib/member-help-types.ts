// Shapes returned by the member-to-member help RPCs
// (20261001000300_member_help.sql). Shared by server and client code.

export interface HelpPerson {
  id: string;
  name: string;
  slug: string | null;
  avatar_url: string | null;
  headline: string | null;
  company: string | null;
  level: number;
  rank: string;
}

export interface HelpRule {
  xp: number;
  rep: number;
  credits: number;
  daily_cap: number | null;
  monthly_cap: number | null;
  active: boolean;
}

// ------------------------------------------------------------ teaming

export type TeamingRole = "prime" | "sub" | "joint_venture" | "mentor_protege" | "supplier" | "consultant";

export const TEAMING_ROLE_LABEL: Record<TeamingRole, string> = {
  prime: "Prime",
  sub: "Subcontractor",
  joint_venture: "Joint venture partner",
  mentor_protege: "Mentor-protégé partner",
  supplier: "Supplier",
  consultant: "Consultant",
};

interface TeamingNeedFields {
  id: string;
  title: string;
  details: string;
  role_sought: TeamingRole;
  set_aside: string | null;
  agency: string | null;
  vehicle: string | null;
  naics_code: string | null;
  respond_by: string | null;
  created_at: string;
}

export interface TeamingNeed extends TeamingNeedFields {
  author: HelpPerson;
  opportunity: { slug: string; title: string } | null;
  response_count: number;
  my_response: "open" | "declined" | "withdrawn" | null;
}

export interface TeamingResponseView {
  id: string;
  person: HelpPerson;
  message: string;
  status: "open" | "declined" | "withdrawn";
  i_confirmed: boolean;
  they_confirmed: boolean;
  matched: boolean;
  blocked: boolean;
  created_at: string;
}

export interface MyTeamingNeed extends TeamingNeedFields {
  status: "open" | "closed";
  responses: TeamingResponseView[];
}

export interface MyTeamingResponse extends TeamingResponseView {
  need_id: string;
  title: string;
  need_status: "open" | "closed";
}

export interface TeamingBoard {
  needs: TeamingNeed[];
  my_needs: MyTeamingNeed[];
  my_responses: MyTeamingResponse[];
  post_rule: HelpRule | null;
  response_rule: HelpRule | null;
  match_rule: HelpRule | null;
}

// --------------------------------------------------------------- wins

export type WinStatus = "pending" | "verified" | "false" | "withdrawn";

export interface ContractWin {
  id: string;
  author: HelpPerson;
  award_number: string;
  title: string;
  agency: string;
  awardee: string;
  amount: number | null;
  award_date: string | null;
  set_aside: string | null;
  naics_code: string | null;
  details: string | null;
  status: WinStatus;
  created_at: string;
  congrats: number;
  congratulated: boolean;
}

export interface MyContractWin {
  id: string;
  award_number: string;
  title: string;
  agency: string;
  status: WinStatus;
  review_note: string | null;
  created_at: string;
}

export interface WinsFeed {
  wins: ContractWin[];
  my_wins: MyContractWin[];
  post_rule: HelpRule | null;
  verified_rule: HelpRule | null;
  congrats_rule: HelpRule | null;
  false_penalty: number;
}

// ------------------------------------------------- capability reviews

export interface CapabilityReview {
  id: string;
  reviewer: HelpPerson;
  strengths: string;
  gaps: string;
  one_fix: string;
  helpful: boolean;
  created_at: string;
}

export interface CapabilityRequest {
  id: string;
  owner: HelpPerson;
  statement_url: string;
  statement_name: string | null;
  note: string | null;
  created_at: string;
  review_count: number;
  reviewed: boolean;
  same_company: boolean;
}

export interface ReviewBoard {
  statement: { url: string; name: string | null } | null;
  my_request: {
    id: string;
    statement_url: string;
    statement_name: string | null;
    note: string | null;
    created_at: string;
    // The profile now has a different statement than this request.
    stale: boolean;
    reviews: CapabilityReview[];
  } | null;
  open_requests: CapabilityRequest[];
  my_reviews: { id: string; owner: HelpPerson; statement_url: string; helpful: boolean; created_at: string }[];
  min_chars: number;
  helpful_per_request: number;
  write_rule: HelpRule | null;
  helpful_rule: HelpRule | null;
}

// ---------------------------------------------------------- mentoring

export interface MentorSession {
  id: string;
  session_date: string;
  minutes: number;
  topic: string;
  status: "pending" | "confirmed" | "disputed";
  protege_note: string | null;
}

export interface Mentorship {
  id: string;
  status: "requested" | "active" | "declined" | "ended";
  message: string | null;
  created_at: string;
  // The other member: the protégé for a mentor, the mentor for a protégé.
  person: HelpPerson;
  sessions: MentorSession[];
}

export interface MentorListing {
  person: HelpPerson;
  topics: string[];
  bio: string | null;
  sessions: number;
  my_status: "requested" | "active" | null;
}

export interface MentoringBoard {
  can_mentor: boolean;
  min_level: number;
  min_rank: string;
  min_minutes: number;
  note_min_chars: number;
  pair_monthly: number;
  my_profile: { topics: string[]; bio: string | null; accepting: boolean } | null;
  mentors: MentorListing[];
  as_mentor: Mentorship[];
  as_protege: Mentorship[];
  mentor_rule: HelpRule | null;
  protege_rule: HelpRule | null;
}

// Short reward text, e.g. "+50 XP · +10 Rep · +20 Credits".
export function rewardText(rule: HelpRule | null | undefined): string {
  if (!rule || !rule.active) return "";
  const parts: string[] = [];
  if (rule.xp) parts.push(`+${rule.xp} XP`);
  if (rule.rep) parts.push(`${rule.rep > 0 ? "+" : ""}${rule.rep} Rep`);
  if (rule.credits) parts.push(`+${rule.credits} Credits`);
  return parts.join(" · ");
}
