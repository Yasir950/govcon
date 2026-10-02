// Shapes returned by the learning-and-status RPCs
// (20261001000600_learning_status.sql): learning paths, verified
// certifications and award predictions. Shared by server and client code.

import type { HelpPerson, HelpRule } from "@/lib/member-help-types";

// --------------------------------------------------------------- learning

export interface LearningBadge {
  code: string;
  name: string;
  icon: string;
  tier: "bronze" | "silver" | "gold" | "single";
  description: string | null;
}

export interface LearningPathSummary {
  id: string;
  slug: string;
  title: string;
  summary: string | null;
  audience: string | null;
  badge: LearningBadge | null;
  lessons: number;
  minutes: number;
  passed: number;
  completed_at: string | null;
  next_lesson: string | null;
}

export interface LearningCatalog {
  paths: LearningPathSummary[];
  lesson_rule: HelpRule | null;
  path_rule: HelpRule | null;
  paid_today: number;
  pending_xp: number;
  pass_pct: number;
}

export interface LearningPathLesson {
  id: string;
  slug: string;
  title: string;
  summary: string | null;
  read_seconds: number;
  questions: number;
  opened: boolean;
  passed_at: string | null;
  best_score: number | null;
  attempts: number;
  xp_paid: boolean;
}

export interface LearningPathDetail {
  id: string;
  slug: string;
  title: string;
  summary: string | null;
  audience: string | null;
  badge: LearningBadge | null;
  completed_at: string | null;
  lessons: LearningPathLesson[];
  lesson_rule: HelpRule | null;
  path_rule: HelpRule | null;
  pass_pct: number;
}

export interface LessonQuestion {
  id: string;
  prompt: string;
  options: string[];
}

export interface LessonDetail {
  id: string;
  slug: string;
  title: string;
  summary: string | null;
  body: string;
  path: { slug: string; title: string };
  position: number;
  total: number;
  prev: { slug: string; title: string } | null;
  next: { slug: string; title: string } | null;
  read_seconds: number;
  seconds_left: number;
  questions: LessonQuestion[];
  attempts: number;
  best_score: number | null;
  passed_at: string | null;
  xp_paid: boolean;
  pass_pct: number;
  lesson_rule: HelpRule | null;
}

export interface QuizResult {
  score: number;
  correct: number;
  total: number;
  passed: boolean;
  first_pass: boolean;
  results: { id: string; correct: boolean; answer?: number; explanation?: string | null }[];
  xp_paid: boolean;
  xp_pending: boolean;
  path_completed: boolean;
}

export function readTime(seconds: number) {
  const m = Math.max(1, Math.round(seconds / 60));
  return `${m} min read`;
}

// ---------------------------------------------------------- certifications

export type CertStatus = "self_reported" | "pending" | "verified" | "lapsed" | "rejected";

// The SBA programs GovConUnited verifies (and gives a badge for).
export const VERIFIABLE_CERTS = ["8a", "hubzone", "wosb", "edwosb", "sdvosb", "sdb"] as const;
export type VerifiableCert = (typeof VERIFIABLE_CERTS)[number];

export function isVerifiable(certType: string): certType is VerifiableCert {
  return (VERIFIABLE_CERTS as readonly string[]).includes(certType);
}

export const CERT_STATUS_LABEL: Record<CertStatus, string> = {
  self_reported: "Self-reported",
  pending: "Verification requested",
  verified: "Verified",
  lapsed: "Lapsed",
  rejected: "Not verified",
};

// ------------------------------------------------------------- predictions

export interface PredictionOption {
  id: string;
  label: string;
  picks: number | null;
}

export interface AwardPrediction {
  id: string;
  title: string;
  agency: string | null;
  details: string | null;
  solicitation_number: string | null;
  estimated_value: string | null;
  opportunity: { slug: string; title: string } | null;
  expected_award_date: string;
  locks_at: string;
  locked: boolean;
  status: "open" | "resolved" | "void";
  void_reason: string | null;
  winner_option_id: string | null;
  award_number: string | null;
  award_url: string | null;
  resolved_at: string | null;
  my_pick: string | null;
  total_picks: number;
  options: PredictionOption[];
}

export interface PredictionStanding extends HelpPerson {
  correct: number;
  picks: number;
  position: number;
}

export interface PredictionsBoard {
  season: { id: string; code: string; name: string; theme: string | null; starts_at: string; ends_at: string; ended: boolean };
  finalized: { at: string; top_correct: number; winners: HelpPerson[] } | null;
  predictions: AwardPrediction[];
  me: { picks: number; correct: number; rank: number | null; picks_bonus_paid: boolean };
  standings: PredictionStanding[];
  seasons: { code: string; name: string }[];
  min_picks: number;
  correct_cap: number;
  lock_hours: number;
  rules: { picks: HelpRule | null; correct: HelpRule | null; oracle: HelpRule | null };
}
