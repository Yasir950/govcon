"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getViewer } from "@/lib/supabase/viewer";
import type { Json } from "@/lib/supabase/types";
import type { AwardMatch } from "@/lib/usaspending";
import { fetchSamEntity, samCertEvidence, samConfigured, samSnapshot, type SamCertEvidence, type SamEntity } from "@/lib/sam-entity";

// Admin tools for batch 5 (learning and status): certification review,
// award predictions and learning content. Point-paying steps go through the
// RPCs, which re-check admin access themselves.

type Result = { ok: true; message?: string } | { ok: false; error: string };

async function requireAdmin() {
  const viewer = await getViewer();
  if (!viewer?.isAdmin) throw new Error("Admin access required");
  return viewer;
}

function done(error: { message?: string } | null, message?: string, extraPaths: string[] = []): Result {
  revalidatePath("/admin/points");
  for (const p of extraPaths) revalidatePath(p);
  return error ? { ok: false, error: error.message || "Something went wrong." } : { ok: true, message };
}

const clean = (v: string | null | undefined) => {
  const t = v?.trim();
  return t ? t : null;
};

// ------------------------------------------------------- certifications

export async function checkSamAction(
  certId: string,
): Promise<{ ok: true; entity: SamEntity; evidence: SamCertEvidence; snapshot: Json } | { ok: false; error: string }> {
  await requireAdmin();
  if (!samConfigured()) return { ok: false, error: "SAM_GOV_API_KEY isn't set on this deployment." };
  const supabase = await createClient();
  const { data: cert } = await supabase.from("company_certifications").select("cert_type, companies!inner(uei)").eq("id", certId).maybeSingle();
  const uei = cert?.companies?.uei?.trim();
  if (!cert || !uei) return { ok: false, error: "This company has no UEI on its page, so SAM.gov can't be checked. Ask the company to add it." };
  try {
    const entity = await fetchSamEntity(uei);
    const today = new Date().toLocaleDateString("en-CA", { timeZone: "America/New_York" });
    const evidence = samCertEvidence(cert.cert_type, entity, today);
    return { ok: true, entity, evidence, snapshot: samSnapshot(entity, evidence) as unknown as Json };
  } catch (err) {
    console.error("checkSamAction failed", err);
    return { ok: false, error: "SAM.gov didn't answer. Try again, or search the UEI on sam.gov." };
  }
}

export async function verifyCertificationAction(
  certId: string,
  expiresOn: string | null,
  source: string,
  note: string,
  sam: Json | null,
): Promise<Result> {
  await requireAdmin();
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("certification_admin_verify", {
    p_cert: certId,
    p_expires_on: clean(expiresOn) ?? undefined,
    p_source: clean(source) ?? undefined,
    p_note: clean(note) ?? undefined,
    p_sam: sam ?? undefined,
  });
  return done(error, data === "reverified" ? "Re-verified for the year." : "Verified. Owners earned their points and badge.", ["/companies"]);
}

export async function rejectCertificationAction(certId: string, note: string): Promise<Result> {
  await requireAdmin();
  const supabase = await createClient();
  const { error } = await supabase.rpc("certification_admin_reject", { p_cert: certId, p_note: note });
  return done(error, "Request declined. The company admins were told why.");
}

export async function lapseCertificationAction(certId: string, reason: string): Promise<Result> {
  await requireAdmin();
  if (!reason.trim()) return { ok: false, error: "Give a reason." };
  const supabase = await createClient();
  const { error } = await supabase.rpc("certification_lapse", { p_cert: certId, p_reason: reason.trim() });
  return done(error, "Marked lapsed. Badges removed.", ["/companies"]);
}

// ---------------------------------------------------------- predictions

export interface PredictionInput {
  id?: string;
  seasonId: string;
  title: string;
  agency: string;
  details: string;
  solicitationNumber: string;
  estimatedValue: string;
  opportunityId: string;
  expectedAwardDate: string;
  options: { id?: string; label: string }[];
}

export async function savePredictionAction(input: PredictionInput): Promise<Result> {
  const viewer = await requireAdmin();
  const options = input.options.map((o) => ({ ...o, label: o.label.trim() })).filter((o) => o.label);
  if (!input.title.trim()) return { ok: false, error: "Give the award a title." };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.expectedAwardDate)) return { ok: false, error: "Set the expected award date." };
  if (options.length < 2) return { ok: false, error: "Add at least two companies to pick from." };
  if (new Set(options.map((o) => o.label.toLowerCase())).size !== options.length) return { ok: false, error: "Each option needs a different name." };

  const supabase = await createClient();
  const row = {
    season_id: input.seasonId,
    title: input.title.trim(),
    agency: clean(input.agency),
    details: clean(input.details),
    solicitation_number: clean(input.solicitationNumber),
    estimated_value: clean(input.estimatedValue),
    opportunity_id: clean(input.opportunityId),
    expected_award_date: input.expectedAwardDate,
  };

  let id = input.id;
  if (id) {
    const { data: current } = await supabase.from("award_predictions").select("status").eq("id", id).maybeSingle();
    if (current?.status !== "open") return { ok: false, error: "Decided or voided predictions can't be edited." };
    const { error } = await supabase.from("award_predictions").update(row).eq("id", id);
    if (error) return done(error);
  } else {
    const { data, error } = await supabase.from("award_predictions").insert({ ...row, created_by: viewer.id }).select("id").single();
    if (error || !data) return done(error);
    id = data.id;
  }

  // Options: keep ids for existing ones; options with picks can't be removed.
  const { data: existing } = await supabase.from("award_prediction_options").select("id").eq("prediction_id", id);
  const keep = new Set(options.map((o) => o.id).filter(Boolean));
  const removed = (existing ?? []).map((o) => o.id).filter((oid) => !keep.has(oid));
  if (removed.length) {
    const { count } = await supabase.from("award_prediction_picks").select("option_id", { count: "exact", head: true }).in("option_id", removed);
    if (count) return { ok: false, error: "Members already picked an option you removed. Rename it instead." };
    const { error } = await supabase.from("award_prediction_options").delete().in("id", removed);
    if (error) return done(error);
  }
  for (const [i, o] of options.entries()) {
    const { error } = o.id
      ? await supabase.from("award_prediction_options").update({ label: o.label, sort_order: i }).eq("id", o.id).eq("prediction_id", id)
      : await supabase.from("award_prediction_options").insert({ prediction_id: id, label: o.label, sort_order: i });
    if (error) return done(error);
  }
  return done(null, input.id ? "Prediction updated." : "Prediction added.", ["/predictions"]);
}

export async function deletePredictionAction(id: string): Promise<Result> {
  await requireAdmin();
  const supabase = await createClient();
  const { count } = await supabase.from("award_prediction_picks").select("user_id", { count: "exact", head: true }).eq("prediction_id", id);
  if (count) return { ok: false, error: "Members have picked this one. Void it instead." };
  const { error } = await supabase.from("award_predictions").delete().eq("id", id);
  return done(error, "Prediction removed.", ["/predictions"]);
}

export async function resolvePredictionAction(id: string, optionId: string, awardNumber: string, award: AwardMatch | null): Promise<Result> {
  await requireAdmin();
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("prediction_admin_resolve", {
    p_prediction: id,
    p_option: optionId,
    p_award_number: clean(awardNumber) ?? award?.awardId ?? undefined,
    p_award_data: award ? (award as unknown as Json) : undefined,
  });
  return done(error, `Winner recorded. ${data ?? 0} correct ${data === 1 ? "pick" : "picks"} paid.`, ["/predictions"]);
}

export async function voidPredictionAction(id: string, reason: string): Promise<Result> {
  await requireAdmin();
  const supabase = await createClient();
  const { error } = await supabase.rpc("prediction_admin_void", { p_prediction: id, p_reason: reason });
  return done(error, "Voided. Any correct-pick XP was reversed.", ["/predictions"]);
}

export async function finalizePredictionSeasonAction(seasonId: string, force: boolean): Promise<Result> {
  await requireAdmin();
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("prediction_season_finalize", { p_season: seasonId, p_force: force });
  if (!error && data === 0) {
    return done(null, force ? "Finalized. Nobody had a correct pick." : "Not finalized: some predictions are still open. Use Force to void them.");
  }
  return done(error, `Season final. ${data} Oracle ${data === 1 ? "winner" : "winners"} paid.`, ["/predictions"]);
}

// ------------------------------------------------------------- learning

export interface PathInput {
  id?: string;
  slug: string;
  title: string;
  summary: string;
  audience: string;
  badgeCode: string;
  // Creates a single-tier learning badge (learn_<slug>) for the path.
  newBadgeName?: string;
  sortOrder: number;
  active: boolean;
}

const SLUG = /^[a-z0-9-]+$/;

export async function savePathAction(input: PathInput): Promise<Result> {
  await requireAdmin();
  if (!SLUG.test(input.slug)) return { ok: false, error: "Slugs use lowercase letters, numbers and dashes." };
  if (!input.title.trim()) return { ok: false, error: "Give the path a title." };
  const supabase = await createClient();
  let badgeCode = clean(input.badgeCode);
  if (input.newBadgeName?.trim()) {
    badgeCode = `learn_${input.slug.replace(/-/g, "_")}`;
    const { error } = await supabase.from("badges").upsert(
      {
        code: badgeCode,
        family: badgeCode,
        name: input.newBadgeName.trim(),
        description: `Completed the ${input.title.trim()} learning path`,
        category: "learning",
        tier: "single",
        credits: 0,
        icon: "book",
        sort_order: 16,
      },
      { onConflict: "code" },
    );
    if (error) return done(error);
  }
  const row = {
    slug: input.slug,
    title: input.title.trim(),
    summary: clean(input.summary),
    audience: clean(input.audience),
    badge_code: badgeCode,
    sort_order: input.sortOrder,
    active: input.active,
  };
  const { error } = input.id
    ? await supabase.from("learning_paths").update(row).eq("id", input.id)
    : await supabase.from("learning_paths").insert(row);
  if (error?.code === "23505") return { ok: false, error: "Another path already uses that slug." };
  return done(error, "Path saved.", ["/learn"]);
}

export interface QuestionInput {
  prompt: string;
  options: string[];
  correctIndex: number;
  explanation: string;
}

export interface LessonInput {
  id?: string;
  pathId: string;
  slug: string;
  title: string;
  summary: string;
  body: string;
  minReadSeconds: number | null;
  sortOrder: number;
  active: boolean;
  questions: QuestionInput[];
}

export async function saveLessonAction(input: LessonInput): Promise<Result> {
  await requireAdmin();
  if (!SLUG.test(input.slug)) return { ok: false, error: "Slugs use lowercase letters, numbers and dashes." };
  if (!input.title.trim() || !input.body.trim()) return { ok: false, error: "A lesson needs a title and a body." };
  const questions = input.questions.map((q) => ({ ...q, prompt: q.prompt.trim(), options: q.options.map((o) => o.trim()) }));
  for (const [i, q] of questions.entries()) {
    if (!q.prompt) return { ok: false, error: `Question ${i + 1} needs a prompt.` };
    if (q.options.length < 2 || q.options.length > 6 || q.options.some((o) => !o)) {
      return { ok: false, error: `Question ${i + 1} needs 2 to 6 filled-in options.` };
    }
    if (q.correctIndex < 0 || q.correctIndex >= q.options.length) return { ok: false, error: `Pick the right answer for question ${i + 1}.` };
  }
  if (input.active && questions.length === 0) return { ok: false, error: "An active lesson needs at least one quiz question." };

  const supabase = await createClient();
  const row = {
    path_id: input.pathId,
    slug: input.slug,
    title: input.title.trim(),
    summary: clean(input.summary),
    body: input.body.trim(),
    min_read_seconds: input.minReadSeconds,
    sort_order: input.sortOrder,
    active: input.active,
    updated_at: new Date().toISOString(),
  };
  let id = input.id;
  if (id) {
    const { error } = await supabase.from("learning_lessons").update(row).eq("id", id);
    if (error?.code === "23505") return { ok: false, error: "Another lesson in this path uses that slug." };
    if (error) return done(error);
  } else {
    const { data, error } = await supabase.from("learning_lessons").insert(row).select("id").single();
    if (error?.code === "23505") return { ok: false, error: "Another lesson in this path uses that slug." };
    if (error || !data) return done(error);
    id = data.id;
  }

  // Questions are replaced as a set (progress is kept per lesson, not per question).
  const { error: delError } = await supabase.from("learning_questions").delete().eq("lesson_id", id);
  if (delError) return done(delError);
  if (questions.length) {
    const { error } = await supabase.from("learning_questions").insert(
      questions.map((q, i) => ({
        lesson_id: id,
        prompt: q.prompt,
        options: q.options,
        correct_index: q.correctIndex,
        explanation: clean(q.explanation),
        sort_order: (i + 1) * 10,
      })),
    );
    if (error) return done(error);
  }
  return done(null, "Lesson saved.", ["/learn"]);
}
