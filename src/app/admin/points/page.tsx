import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import {
  AdminConfigTable,
  AdminFlagsList,
  AdminHolidays,
  AdminMemberAudit,
  AdminNewQuest,
  AdminRedemptions,
  AdminReverseSource,
  AdminSeasons,
  AdminChallenges,
} from "./AdminPointsClient";
import { AdminQuestions, type AdminQuestion } from "./AdminQuestions";
import { AdminWins, type AdminWin } from "./AdminWins";
import { AdminCertifications, type AdminCert } from "./AdminCertifications";
import { AdminPredictions, type AdminPrediction } from "./AdminPredictions";
import { AdminLearning, type AdminPath } from "./AdminLearning";
import { AdminSurprises, type SurpriseStats } from "./AdminSurprises";
import { AdminStore, type StoreAdminReward } from "./AdminStore";
import { fetchExpertQueue } from "@/app/(app)/expert-queue/actions";
import { getViewer } from "@/lib/supabase/viewer";
import { usaspendingSearchUrl } from "@/lib/usaspending";

export const dynamic = "force-dynamic";

function isCurrentSeason(s: { starts_at: string; ends_at: string }) {
  const now = Date.now();
  return new Date(s.starts_at).getTime() <= now && new Date(s.ends_at).getTime() > now;
}

function thirtyDaysAgo() {
  return new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10);
}

const TABS = [
  ["audit", "Member audit"],
  ["flags", "Review queue"],
  ["redemptions", "Redemptions"],
  ["config", "Point values & caps"],
  ["catalog", "Quests, badges & store"],
  ["store", "Store fulfilment"],
  ["seasons", "Challenges & seasons"],
  ["questions", "Question of the day"],
  ["wins", "Contract wins"],
  ["certifications", "Certifications"],
  ["predictions", "Award predictions"],
  ["learning", "Learning paths"],
  ["surprises", "Surprise bonuses"],
] as const;

export default async function AdminPointsPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string; q?: string; member?: string; season?: string }>;
}) {
  const { tab = "audit", q, member, season } = await searchParams;
  const supabase = await createClient();

  let content: React.ReactNode = null;

  if (tab === "audit") {
    let results: { id: string; name: string; email: string | null }[] = [];
    if (q?.trim()) {
      const term = q.trim().replace(/[%,()]/g, "");
      const { data } = await supabase
        .from("profiles")
        .select("id, first_name, last_name, email")
        .or(`first_name.ilike.%${term}%,last_name.ilike.%${term}%,email.ilike.%${term}%`)
        .limit(20);
      results = (data ?? []).map((p) => ({ id: p.id, name: `${p.first_name ?? ""} ${p.last_name ?? ""}`.trim() || "Member", email: p.email }));
    }
    let audit = null;
    if (member) {
      const [{ data: profile }, { data: points }, { data: events }, { data: badges }, { data: actions }, { data: flags }, { data: allBadges }, { data: communities }] =
        await Promise.all([
          supabase.from("profiles").select("id, first_name, last_name, email, created_at, suspended_at, suspended_reason, invited_by").eq("id", member).maybeSingle(),
          supabase.from("user_points").select("*").eq("user_id", member).maybeSingle(),
          supabase
            .from("point_events")
            .select("id, action_type, xp, rep, credits, source_type, source_id, actor_user_id, community_id, meta, multiplier, local_day, created_at, reversed_at, reversal_reason")
            .eq("user_id", member)
            .order("created_at", { ascending: false })
            .limit(300),
          supabase.from("user_badges").select("id, earned_at, revoked_at, pinned, award_key, community_id, note, badges(code, name, tier)").eq("user_id", member).order("earned_at", { ascending: false }),
          supabase.from("points_admin_actions").select("id, action, reason, detail, created_at").eq("user_id", member).order("created_at", { ascending: false }).limit(50),
          supabase.from("points_flags").select("id, kind, status, detail, created_at").or(`user_id.eq.${member},related_user_id.eq.${member}`).order("created_at", { ascending: false }).limit(30),
          supabase.from("badges").select("code, name, tier, manual, per_community").eq("active", true).order("sort_order"),
          supabase.from("communities").select("id, name").order("name"),
        ]);
      if (profile) {
        audit = {
          profile: {
            id: profile.id,
            name: `${profile.first_name ?? ""} ${profile.last_name ?? ""}`.trim() || "Member",
            email: profile.email,
            createdAt: profile.created_at,
            suspendedAt: profile.suspended_at,
            suspendedReason: profile.suspended_reason,
            invitedBy: profile.invited_by,
          },
          points,
          events: events ?? [],
          badges: (badges ?? []).map((b) => ({
            id: b.id,
            earnedAt: b.earned_at,
            revokedAt: b.revoked_at,
            pinned: b.pinned,
            awardKey: b.award_key,
            note: b.note,
            communityId: b.community_id,
            code: (b.badges as { code: string } | null)?.code ?? "",
            name: (b.badges as { name: string } | null)?.name ?? "",
            tier: (b.badges as { tier: string } | null)?.tier ?? "",
          })),
          actions: actions ?? [],
          flags: flags ?? [],
          badgeOptions: allBadges ?? [],
          communities: communities ?? [],
          defaultSince: thirtyDaysAgo(),
        };
      }
    }
    content = (
      <>
        <form className="toolbar" style={{ marginBottom: 12 }}>
          <input type="hidden" name="tab" value="audit" />
          <input className="field" name="q" defaultValue={q ?? ""} placeholder="Search members by name or email" />
          <button className="btn btn-primary">Search</button>
        </form>
        {results.length > 0 && (
          <div className="card panel" style={{ marginBottom: 12 }}>
            {results.map((r) => (
              <div key={r.id}>
                <Link href={`/admin/points?tab=audit&member=${r.id}`}>{r.name}</Link> <span className="meta">{r.email}</span>
              </div>
            ))}
          </div>
        )}
        {audit ? <AdminMemberAudit audit={audit} /> : <p className="meta">Search for a member to see every point event, adjust points or apply penalties.</p>}
        <AdminReverseSource />
      </>
    );
  } else if (tab === "flags") {
    const { data } = await supabase
      .from("points_flags")
      .select("id, kind, status, detail, created_at, resolution, user_id, related_user_id, user:profiles!points_flags_user_id_fkey(first_name, last_name), related:profiles!points_flags_related_user_id_fkey(first_name, last_name)")
      .order("status")
      .order("created_at", { ascending: false })
      .limit(200);
    content = <AdminFlagsList flags={data ?? []} />;
  } else if (tab === "redemptions") {
    const { data } = await supabase
      .from("redemptions")
      .select("id, reward_code, price, status, target_type, target_id, expires_at, meta, created_at, decline_reason, user_id, rewards(name, fulfilment), profiles!redemptions_user_id_fkey(first_name, last_name)")
      .order("created_at", { ascending: false })
      .limit(200);
    content = <AdminRedemptions redemptions={data ?? []} />;
  } else if (tab === "config") {
    const [
      { data: settings },
      { data: rules },
      { data: levels },
      { data: milestones },
      { data: holidays },
      { data: buddyMilestones },
      { data: companyPrizes },
    ] = await Promise.all([
      supabase.from("points_settings").select("*").order("key"),
      supabase.from("point_rules").select("*").order("sort_order"),
      supabase.from("point_levels").select("*").order("level"),
      supabase.from("streak_milestones").select("*").order("days"),
      supabase.from("federal_holidays").select("*").order("day"),
      supabase.from("streak_buddy_milestones").select("*").order("days"),
      supabase.from("company_leaderboard_prizes").select("*").order("rank"),
    ]);
    content = (
      <>
        <AdminConfigTable
          title="Settings"
          table="points_settings"
          pk="key"
          rows={(settings ?? []).map((s) => ({ ...s, value: JSON.stringify(s.value) }))}
          columns={[
            { key: "key", label: "Key", readOnly: true },
            { key: "value", label: "Value (JSON)" },
            { key: "description", label: "What it does", readOnly: true },
          ]}
        />
        <AdminConfigTable
          title="Point rules"
          table="point_rules"
          pk="action_type"
          rows={rules ?? []}
          columns={[
            { key: "action_type", label: "Action", readOnly: true },
            { key: "category", label: "Kind", readOnly: true },
            { key: "label", label: "Label" },
            { key: "xp", label: "XP", type: "number" },
            { key: "rep", label: "Rep", type: "number" },
            { key: "credits", label: "Credits", type: "number" },
            { key: "daily_cap", label: "Daily cap", type: "number" },
            { key: "monthly_cap", label: "Monthly cap", type: "number" },
            { key: "counts_for_streak", label: "Streak", type: "bool" },
            { key: "active", label: "Active", type: "bool" },
          ]}
        />
        <AdminConfigTable
          title="Levels and ranks"
          table="point_levels"
          pk="level"
          rows={levels ?? []}
          columns={[
            { key: "level", label: "Level", readOnly: true },
            { key: "rank_name", label: "Rank" },
            { key: "xp_required", label: "Total XP", type: "number" },
            { key: "credits_reward", label: "Credits", type: "number" },
            { key: "pro_days", label: "Pro days", type: "number" },
            { key: "unlocks", label: "Unlocks" },
          ]}
        />
        <AdminConfigTable
          title="Streak milestones"
          table="streak_milestones"
          pk="days"
          rows={milestones ?? []}
          columns={[
            { key: "days", label: "Workdays", readOnly: true },
            { key: "xp", label: "XP", type: "number" },
            { key: "credits", label: "Credits", type: "number" },
            { key: "multiplier", label: "Multiplier", type: "number" },
            { key: "badge_code", label: "Badge" },
            { key: "flair", label: "Flair" },
          ]}
        />
        <AdminConfigTable
          title="Streak buddy milestones"
          table="streak_buddy_milestones"
          pk="days"
          rows={buddyMilestones ?? []}
          columns={[
            { key: "days", label: "Workdays", readOnly: true },
            { key: "xp", label: "XP each", type: "number" },
            { key: "credits", label: "Credits each", type: "number" },
            { key: "badge_code", label: "Badge" },
          ]}
        />
        <AdminConfigTable
          title="Company leaderboard prizes (per active employee)"
          table="company_leaderboard_prizes"
          pk="rank"
          rows={companyPrizes ?? []}
          columns={[
            { key: "rank", label: "Rank", readOnly: true },
            { key: "credits_per_employee", label: "Credits", type: "number" },
            { key: "top_badge", label: "Top Company badge", type: "bool" },
          ]}
        />
        <AdminHolidays holidays={holidays ?? []} />
      </>
    );
  } else if (tab === "catalog") {
    const [{ data: quests }, { data: badges }, { data: rewards }] = await Promise.all([
      supabase.from("quests").select("*").order("sort_order"),
      supabase.from("badges").select("*").order("sort_order"),
      supabase.from("rewards").select("*").order("sort_order"),
    ]);
    content = (
      <>
        <AdminConfigTable
          title="Quest pool"
          table="quests"
          pk="id"
          rows={(quests ?? []).map((qq) => ({ ...qq, actions: qq.action_types.join(", "), filter_text: JSON.stringify(qq.filters) }))}
          columns={[
            { key: "code", label: "Code", readOnly: true },
            { key: "title", label: "Title" },
            { key: "difficulty", label: "Difficulty" },
            { key: "target_count", label: "Target", type: "number" },
            { key: "actions", label: "Counts", readOnly: true },
            { key: "filter_text", label: "Filters", readOnly: true },
            { key: "quest_set", label: "Set" },
            { key: "weight", label: "Weight", type: "number" },
            { key: "active", label: "Active", type: "bool" },
          ]}
        />
        <AdminNewQuest />
        <AdminConfigTable
          title="Badges"
          table="badges"
          pk="id"
          rows={badges ?? []}
          columns={[
            { key: "code", label: "Code", readOnly: true },
            { key: "name", label: "Name" },
            { key: "tier", label: "Tier", readOnly: true },
            { key: "metric", label: "Metric", readOnly: true },
            { key: "threshold", label: "Threshold", type: "number" },
            { key: "credits", label: "Credits", type: "number" },
            { key: "hidden", label: "Hidden", type: "bool" },
            { key: "active", label: "Active", type: "bool" },
          ]}
        />
        <AdminConfigTable
          title="Credits store"
          table="rewards"
          pk="id"
          rows={rewards ?? []}
          columns={[
            { key: "code", label: "Code", readOnly: true },
            { key: "name", label: "Name" },
            { key: "price", label: "Credits", type: "number" },
            { key: "limit_count", label: "Limit", type: "number" },
            { key: "limit_period", label: "Per" },
            { key: "min_level", label: "Min level", type: "number" },
            { key: "stock_count", label: "Stock cap", type: "number" },
            { key: "stock_period", label: "Cap per" },
            { key: "active", label: "Active", type: "bool" },
          ]}
        />
      </>
    );
  } else if (tab === "seasons") {
    const [{ data: seasons }, { data: results }, { data: templates }, { data: challenges }] = await Promise.all([
      supabase.from("seasons").select("*").order("starts_at"),
      supabase
        .from("season_results")
        .select("season_id, user_id, rank, season_points, xp, rep, streak_days, reward, spotlight, profiles(first_name, last_name, email)")
        .not("rank", "is", null)
        .lte("rank", 10)
        .order("rank"),
      supabase.from("challenge_templates").select("*").order("sort_order"),
      supabase.from("challenges").select("*").order("starts_at", { ascending: false }).limit(20),
    ]);
    content = (
      <>
        <AdminChallenges templates={templates ?? []} challenges={challenges ?? []} />
        <AdminConfigTable
          title="Challenge templates"
          table="challenge_templates"
          pk="id"
          rows={(templates ?? []).map((t) => ({ ...t, reqs: JSON.stringify(t.requirements) }))}
          columns={[
            { key: "code", label: "Code", readOnly: true },
            { key: "title", label: "Title" },
            { key: "reqs", label: "Requirements", readOnly: true },
            { key: "xp", label: "XP", type: "number" },
            { key: "credits", label: "Credits", type: "number" },
            { key: "active", label: "Active", type: "bool" },
          ]}
        />
        <AdminSeasons seasons={seasons ?? []} results={results ?? []} />
      </>
    );
  }

  if (tab === "questions") {
    const { data: rows } = await supabase
      .from("daily_questions")
      .select("id, question, status, day, created_at, reject_reason, profiles(first_name, last_name), daily_question_options(id, label, sort_order)")
      .neq("status", "rejected")
      .order("created_at", { ascending: false })
      .limit(200);
    const publishedIds = (rows ?? []).filter((r) => r.status === "published").map((r) => r.id);
    const { data: votes } = publishedIds.length
      ? await supabase.from("daily_question_votes").select("question_id, option_id").in("question_id", publishedIds)
      : { data: [] as { question_id: string; option_id: string }[] };
    const votesByOption = new Map<string, number>();
    for (const v of votes ?? []) votesByOption.set(v.option_id, (votesByOption.get(v.option_id) ?? 0) + 1);
    const questions: AdminQuestion[] = (rows ?? []).map((r) => {
      const options = [...(r.daily_question_options ?? [])]
        .sort((a, b) => a.sort_order - b.sort_order)
        .map((o) => ({ label: o.label, votes: votesByOption.get(o.id) ?? 0 }));
      const name = r.profiles ? `${r.profiles.first_name ?? ""} ${r.profiles.last_name ?? ""}`.trim() : "";
      return {
        id: r.id,
        question: r.question,
        status: r.status as AdminQuestion["status"],
        day: r.day,
        createdAt: r.created_at,
        suggestedBy: r.profiles ? name || "A member" : null,
        rejectReason: r.reject_reason,
        options,
        totalVotes: options.reduce((n, o) => n + o.votes, 0),
      };
    });
    content = <AdminQuestions questions={questions} />;
  }

  if (tab === "wins") {
    const select =
      "id, author_id, award_number, title, agency, awardee, amount, award_date, status, review_note, created_at, profiles!contract_wins_author_id_fkey(first_name, last_name)";
    const [{ data: open }, { data: done }] = await Promise.all([
      supabase.from("contract_wins").select(select).in("status", ["pending", "withdrawn"]).is("reviewed_at", null).order("created_at").limit(200),
      supabase.from("contract_wins").select(select).not("reviewed_at", "is", null).order("reviewed_at", { ascending: false }).limit(50),
    ]);
    const toWin = (w: NonNullable<typeof open>[number]): AdminWin => ({
      id: w.id,
      authorId: w.author_id,
      authorName: w.profiles ? `${w.profiles.first_name ?? ""} ${w.profiles.last_name ?? ""}`.trim() || "Member" : "Member",
      awardNumber: w.award_number,
      title: w.title,
      agency: w.agency,
      awardee: w.awardee,
      amount: w.amount,
      awardDate: w.award_date,
      status: w.status as AdminWin["status"],
      reviewNote: w.review_note,
      createdAt: w.created_at,
      searchUrl: usaspendingSearchUrl(w.award_number),
    });
    content = <AdminWins pending={(open ?? []).map(toWin)} reviewed={(done ?? []).map(toWin)} />;
  }

  if (tab === "certifications") {
    const select =
      "id, cert_type, status, company_id, evidence_url, request_note, requested_at, verified_at, expires_on, reverify_due_on, reverify_requested_at, source_note, lapse_reason, last_checked_at, sam_check, companies!inner(name, slug, uei), profiles!company_certifications_requested_by_fkey(first_name, last_name)";
    const verifiable = ["8a", "hubzone", "wosb", "edwosb", "sdvosb", "sdb"];
    const [{ data: queue }, { data: verified }, { data: recent }] = await Promise.all([
      supabase
        .from("company_certifications")
        .select(select)
        .in("cert_type", verifiable)
        .or("status.eq.pending,and(status.eq.verified,reverify_requested_at.not.is.null)")
        .order("requested_at")
        .limit(200),
      supabase
        .from("company_certifications")
        .select(select)
        .eq("status", "verified")
        .is("reverify_requested_at", null)
        .order("reverify_due_on")
        .limit(200),
      supabase
        .from("company_certifications")
        .select(select)
        .in("status", ["lapsed", "rejected"])
        .order("created_at", { ascending: false })
        .limit(30),
    ]);
    const toCert = (c: NonNullable<typeof queue>[number]): AdminCert => ({
      id: c.id,
      certType: c.cert_type,
      status: c.status as AdminCert["status"],
      companyId: c.company_id,
      companyName: c.companies?.name ?? "Company",
      companySlug: c.companies?.slug ?? "",
      uei: c.companies?.uei ?? null,
      evidenceUrl: c.evidence_url,
      requestNote: c.request_note,
      requestedAt: c.reverify_requested_at ?? c.requested_at,
      requestedBy: c.profiles ? `${c.profiles.first_name ?? ""} ${c.profiles.last_name ?? ""}`.trim() || null : null,
      verifiedAt: c.verified_at,
      expiresOn: c.expires_on,
      reverifyDueOn: c.reverify_due_on,
      reverifyRequestedAt: c.reverify_requested_at,
      sourceNote: c.source_note,
      lapseReason: c.lapse_reason,
      lastCheckedAt: c.last_checked_at,
      samDetail: (c.sam_check as { detail?: string } | null)?.detail ?? null,
    });
    content = (
      <AdminCertifications queue={(queue ?? []).map(toCert)} verified={(verified ?? []).map(toCert)} recent={(recent ?? []).map(toCert)} />
    );
  }

  if (tab === "predictions") {
    const [{ data: seasons }, { data: finals }, { data: max }] = await Promise.all([
      supabase.from("seasons").select("id, code, name, starts_at, ends_at").order("starts_at"),
      supabase.from("award_prediction_seasons").select("season_id"),
      supabase.from("points_settings").select("value").eq("key", "prediction_featured_per_season").maybeSingle(),
    ]);
    const current =
      (seasons ?? []).find((s) => s.id === season) ??
      (seasons ?? []).find(isCurrentSeason) ??
      (seasons ?? [])[0];
    const { data: rows } = current
      ? await supabase
          .from("award_predictions")
          .select(
            "id, season_id, title, agency, details, solicitation_number, estimated_value, opportunity_id, expected_award_date, status, void_reason, winner_option_id, award_number, award_prediction_options!award_prediction_options_prediction_id_fkey(id, label, sort_order)",
          )
          .eq("season_id", current.id)
          .order("expected_award_date")
      : { data: [] };
    const ids = (rows ?? []).map((r) => r.id);
    const { data: picks } = ids.length
      ? await supabase.from("award_prediction_picks").select("option_id").in("prediction_id", ids)
      : { data: [] as { option_id: string }[] };
    const pickCount = new Map<string, number>();
    for (const p of picks ?? []) pickCount.set(p.option_id, (pickCount.get(p.option_id) ?? 0) + 1);
    const finalized = new Set((finals ?? []).map((x) => x.season_id));
    const predictions: AdminPrediction[] = (rows ?? []).map((r) => ({
      id: r.id,
      seasonId: r.season_id,
      title: r.title,
      agency: r.agency,
      details: r.details,
      solicitationNumber: r.solicitation_number,
      estimatedValue: r.estimated_value,
      opportunityId: r.opportunity_id,
      expectedAwardDate: r.expected_award_date,
      status: r.status as AdminPrediction["status"],
      voidReason: r.void_reason,
      winnerOptionId: r.winner_option_id,
      awardNumber: r.award_number,
      options: [...(r.award_prediction_options ?? [])]
        .sort((a, b) => a.sort_order - b.sort_order)
        .map((o) => ({ id: o.id, label: o.label, picks: pickCount.get(o.id) ?? 0 })),
    }));
    content = current ? (
      <AdminPredictions
        seasons={(seasons ?? []).map((s) => ({ id: s.id, code: s.code, name: s.name, endsAt: s.ends_at, finalized: finalized.has(s.id) }))}
        seasonId={current.id}
        predictions={predictions}
        maxPerSeason={Number(max?.value ?? 10)}
      />
    ) : (
      <p className="meta">No seasons are set up yet.</p>
    );
  }

  if (tab === "learning") {
    const [{ data: paths }, { data: lessons }, { data: questions }, { data: progress }, { data: completions }, { data: badges }] =
      await Promise.all([
        supabase.from("learning_paths").select("*").order("sort_order"),
        supabase.from("learning_lessons").select("*").order("sort_order"),
        supabase.from("learning_questions").select("*").order("sort_order"),
        supabase.from("learning_progress").select("lesson_id").not("passed_at", "is", null),
        supabase.from("learning_path_completions").select("path_id"),
        supabase.from("badges").select("code, name").eq("category", "learning").order("sort_order"),
      ]);
    const passes = new Map<string, number>();
    for (const r of progress ?? []) passes.set(r.lesson_id, (passes.get(r.lesson_id) ?? 0) + 1);
    const completed = new Map<string, number>();
    for (const r of completions ?? []) completed.set(r.path_id, (completed.get(r.path_id) ?? 0) + 1);
    const adminPaths: AdminPath[] = (paths ?? []).map((p) => ({
      id: p.id,
      slug: p.slug,
      title: p.title,
      summary: p.summary,
      audience: p.audience,
      badgeCode: p.badge_code,
      sortOrder: p.sort_order,
      active: p.active,
      completions: completed.get(p.id) ?? 0,
      lessons: (lessons ?? [])
        .filter((l) => l.path_id === p.id)
        .map((l) => ({
          id: l.id,
          pathId: l.path_id,
          slug: l.slug,
          title: l.title,
          summary: l.summary,
          body: l.body,
          minReadSeconds: l.min_read_seconds,
          sortOrder: l.sort_order,
          active: l.active,
          passes: passes.get(l.id) ?? 0,
          questions: (questions ?? [])
            .filter((qq) => qq.lesson_id === l.id)
            .map((qq) => ({ prompt: qq.prompt, options: qq.options, correctIndex: qq.correct_index, explanation: qq.explanation ?? "" })),
        })),
    }));
    content = <AdminLearning paths={adminPaths} badges={badges ?? []} />;
  }

  if (tab === "store") {
    const [{ data: overview }, queue, { data: partners }, viewer] = await Promise.all([
      supabase.rpc("store_admin_overview"),
      fetchExpertQueue(),
      supabase.from("companies").select("id, name").eq("is_partner", true).is("archived_at", null).order("name"),
      getViewer(),
    ]);
    content = (
      <AdminStore
        rewards={(overview ?? []) as unknown as StoreAdminReward[]}
        requests={queue?.requests ?? []}
        experts={queue?.experts ?? []}
        partners={partners ?? []}
        viewerId={viewer?.id ?? ""}
      />
    );
  }

  if (tab === "surprises") {
    const since = `${thirtyDaysAgo()}T00:00:00Z`;
    const [{ data: hours }, { data: stats }] = await Promise.all([
      supabase
        .from("double_xp_hours")
        .select("id, starts_at, ends_at, source, cancelled_at")
        .gte("ends_at", since)
        .order("starts_at", { ascending: false })
        .limit(100),
      supabase.rpc("surprise_admin_stats"),
    ]);
    content = (
      <AdminSurprises
        hours={(hours ?? []).map((h) => ({
          id: h.id,
          startsAt: h.starts_at,
          endsAt: h.ends_at,
          source: h.source === "auto" ? "auto" : "admin",
          cancelledAt: h.cancelled_at,
        }))}
        stats={(stats as SurpriseStats | null) ?? null}
      />
    );
  }

  return (
    <div>
      <div className="page-head">
        <div>
          <h1>Points &amp; Rewards</h1>
          <p>Audit and adjust points, review anti-gaming flags, fulfil redemptions, and tune every value without a deploy.</p>
        </div>
      </div>
      <div className="tabs" style={{ marginBottom: 16 }}>
        {TABS.map(([key, label]) => (
          <Link key={key} href={`/admin/points?tab=${key}`} className={`tab${tab === key ? " active" : ""}`}>
            {label}
          </Link>
        ))}
      </div>
      {content}
    </div>
  );
}
