import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/types";
import { paginateSamGovOpportunities, type FetchPage, type SamGovSearchParams } from "./client";
import { parseSamGovRecord, type NormalizedOpportunity } from "./parse";
import type { SamGovRawRecord } from "./parse";

const DAY_MS = 24 * 60 * 60 * 1000;
// First run (or a run after a long gap) backfills at most this far — SAM.gov
// posts ~1,200 notices/day, so a week is already ~9 pages of 1,000.
const MAX_BACKFILL_DAYS = 7;
// A notice with no response deadline is archived this long after posting.
const UNDATED_ARCHIVE_AFTER_DAYS = 90;
// Keeps PostgREST `in (...)` filters well under URL length limits.
const ID_CHUNK = 200;

function mmddyyyy(date: Date): string {
  return `${String(date.getMonth() + 1).padStart(2, "0")}/${String(date.getDate()).padStart(2, "0")}/${date.getFullYear()}`;
}

function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

// Incremental window: everything posted since the day before the last
// successful run (the overlap catches notices posted late in that day),
// capped at MAX_BACKFILL_DAYS so one run stays within the API key's daily
// request quota and the route's time limit.
async function defaultSearchParams(supabase: SupabaseClient<Database>): Promise<SamGovSearchParams> {
  const to = new Date();
  const { data: lastRun } = await supabase
    .from("opportunity_sync_runs")
    .select("started_at")
    .eq("source", "sam_gov")
    .in("status", ["success", "partial"])
    .order("started_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  const earliest = to.getTime() - MAX_BACKFILL_DAYS * DAY_MS;
  const fromMs = lastRun ? Math.max(new Date(lastRun.started_at).getTime() - DAY_MS, earliest) : earliest;
  return { postedFrom: mmddyyyy(new Date(fromMs)), postedTo: mmddyyyy(to) };
}

export interface RunSamGovSyncArgs {
  supabase: SupabaseClient<Database>;
  trigger: "cron" | "admin";
  triggeredByProfileId?: string;
  searchParams?: SamGovSearchParams;
  fetchPage?: FetchPage;
}

export interface SyncRunSummary {
  runId: string;
  status: "success" | "partial" | "failed";
  pagesFetched: number;
  recordsSeen: number;
  createdCount: number;
  updatedCount: number;
  skippedCount: number;
  failedCount: number;
  archivedCount: number;
}

// Replaces contacts/attachments for a batch of opportunities in a handful of
// bulk statements rather than four round-trips per notice.
async function replaceContactsAndAttachments(
  supabase: SupabaseClient<Database>,
  rows: { opportunityId: string; normalized: NormalizedOpportunity }[],
): Promise<void> {
  if (rows.length === 0) return;
  for (const ids of chunk(rows.map((r) => r.opportunityId), ID_CHUNK)) {
    await supabase.from("opportunity_contacts").delete().in("opportunity_id", ids);
    await supabase.from("opportunity_attachments").delete().in("opportunity_id", ids);
  }

  const contacts = rows.flatMap(({ opportunityId, normalized }) =>
    normalized.contacts.map((c, i) => ({
      opportunity_id: opportunityId,
      name: c.name,
      email: c.email,
      phone: c.phone,
      role: c.role,
      sort_order: i,
    })),
  );
  if (contacts.length > 0) await supabase.from("opportunity_contacts").insert(contacts);

  const attachments = rows.flatMap(({ opportunityId, normalized }) =>
    normalized.attachmentUrls.map((url, i) => ({
      opportunity_id: opportunityId,
      label: `Attachment ${i + 1}`,
      url,
      kind: "resource_link" as const,
      sort_order: i,
    })),
  );
  if (attachments.length > 0) await supabase.from("opportunity_attachments").insert(attachments);
}

function toOpportunityRow(normalized: NormalizedOpportunity, now: string) {
  return {
    source: "sam_gov" as const,
    notice_id: normalized.noticeId,
    solicitation_number: normalized.solicitationNumber,
    title: normalized.title,
    agency: normalized.agency,
    subagency: normalized.subagency,
    office: normalized.office,
    notice_type: normalized.noticeType,
    set_aside_code: normalized.setAsideCode,
    set_aside_description: normalized.setAsideDescription,
    naics_code: normalized.naicsCode ?? "",
    psc_code: normalized.pscCode,
    place_city: normalized.placeCity,
    place_state: normalized.placeState,
    place_zip: normalized.placeZip,
    place_country: normalized.placeCountry,
    location: normalized.location,
    posted_date: normalized.postedDate,
    response_deadline: normalized.responseDeadline,
    description: normalized.description,
    source_url: normalized.sourceUrl,
    content_hash: normalized.contentHash,
    last_synced_at: now,
    last_seen_in_sync_at: now,
    status: normalized.active ? ("published" as const) : ("archived" as const),
    archived_at: normalized.active ? null : now,
    archived_reason: normalized.active ? null : "Closed on SAM.gov",
  };
}

// Orchestrates one SAM.gov sync run: paginate the incremental window ->
// per page, classify each notice as create/update/skip by comparing
// content_hash against the existing (source, notice_id) row, then write
// in bulk -> archive notices whose response deadline has passed. Failed
// records are logged to opportunity_sync_errors without aborting the run.
// fetchPage is dependency-injected (defaults to the real HTTP client) so
// tests can substitute fixture pages without a live API key.
export async function runSamGovSync(args: RunSamGovSyncArgs): Promise<SyncRunSummary> {
  const { supabase, trigger, triggeredByProfileId, fetchPage } = args;
  const searchParams = args.searchParams ?? (await defaultSearchParams(supabase));

  const { data: run, error: runError } = await supabase
    .from("opportunity_sync_runs")
    .insert({
      source: "sam_gov",
      status: "running",
      trigger,
      triggered_by_profile_id: triggeredByProfileId ?? null,
      params: searchParams as unknown as Record<string, string>,
    })
    .select("id")
    .single();
  if (runError || !run) throw runError ?? new Error("Failed to create sync run");

  let pagesFetched = 0;
  let recordsSeen = 0;
  let createdCount = 0;
  let updatedCount = 0;
  let skippedCount = 0;
  let failedCount = 0;
  let archivedCount = 0;

  async function logFailure(raw: Pick<SamGovRawRecord, "noticeId">, err: unknown, payload: unknown) {
    failedCount++;
    await supabase.from("opportunity_sync_errors").insert({
      run_id: run!.id,
      notice_id: raw.noticeId ?? null,
      message: err instanceof Error ? err.message : typeof err === "object" && err && "message" in err ? String(err.message) : String(err),
      raw_payload: payload as Record<string, string>,
    });
  }

  try {
    for await (const page of paginateSamGovOpportunities(searchParams, fetchPage)) {
      pagesFetched++;
      recordsSeen += page.length;
      const now = new Date().toISOString();

      // Parse, and dedupe by noticeId (a notice can shift between pages
      // mid-pagination; the last occurrence wins).
      const parsed = new Map<string, { raw: SamGovRawRecord; normalized: NormalizedOpportunity }>();
      for (const raw of page) {
        try {
          const normalized = parseSamGovRecord(raw);
          parsed.set(normalized.noticeId, { raw, normalized });
        } catch (err) {
          await logFailure(raw, err, raw);
        }
      }

      const existing = new Map<string, { id: string; content_hash: string | null }>();
      for (const ids of chunk([...parsed.keys()], ID_CHUNK)) {
        const { data, error } = await supabase
          .from("opportunities")
          .select("id, notice_id, content_hash")
          .eq("source", "sam_gov")
          .in("notice_id", ids);
        if (error) throw error;
        for (const row of data ?? []) existing.set(row.notice_id!, { id: row.id, content_hash: row.content_hash });
      }

      const toCreate: { raw: SamGovRawRecord; normalized: NormalizedOpportunity }[] = [];
      const toUpdate: { raw: SamGovRawRecord; normalized: NormalizedOpportunity; id: string }[] = [];
      const unchangedIds: string[] = [];
      for (const [noticeId, entry] of parsed) {
        const row = existing.get(noticeId);
        if (!row) toCreate.push(entry);
        else if (row.content_hash === entry.normalized.contentHash) unchangedIds.push(row.id);
        else toUpdate.push({ ...entry, id: row.id });
      }

      for (const ids of chunk(unchangedIds, ID_CHUNK)) {
        await supabase.from("opportunities").update({ last_seen_in_sync_at: now }).in("id", ids);
      }
      skippedCount += unchangedIds.length;

      const written: { opportunityId: string; normalized: NormalizedOpportunity }[] = [];

      // Bulk insert; if the batch is rejected (e.g. one slug collision),
      // fall back to row-by-row so a single bad record can't sink the page.
      if (toCreate.length > 0) {
        const { data: inserted, error } = await supabase
          .from("opportunities")
          .insert(toCreate.map(({ normalized }) => ({ ...toOpportunityRow(normalized, now), slug: normalized.slug })))
          .select("id, notice_id");
        if (!error && inserted) {
          const idByNotice = new Map(inserted.map((r) => [r.notice_id!, r.id]));
          for (const { normalized } of toCreate) {
            const id = idByNotice.get(normalized.noticeId);
            if (id) written.push({ opportunityId: id, normalized });
          }
          createdCount += inserted.length;
        } else {
          for (const { raw, normalized } of toCreate) {
            const { data: one, error: oneError } = await supabase
              .from("opportunities")
              .insert({ ...toOpportunityRow(normalized, now), slug: normalized.slug })
              .select("id")
              .single();
            if (oneError || !one) {
              await logFailure(raw, oneError ?? new Error("Insert returned no row"), raw);
              continue;
            }
            written.push({ opportunityId: one.id, normalized });
            createdCount++;
          }
        }
      }

      for (const { raw, normalized, id } of toUpdate) {
        const { error } = await supabase.from("opportunities").update(toOpportunityRow(normalized, now)).eq("id", id);
        if (error) {
          await logFailure(raw, error, raw);
          continue;
        }
        written.push({ opportunityId: id, normalized });
        updatedCount++;
      }

      await replaceContactsAndAttachments(supabase, written);
    }

    // Syncs are incremental (recently posted notices only), so an older
    // notice not appearing in this run says nothing about whether it's
    // still open — archive on the notice's own deadline instead.
    const nowIso = new Date().toISOString();
    const { data: pastDeadline } = await supabase
      .from("opportunities")
      .update({ status: "archived", archived_at: nowIso, archived_reason: "Response deadline passed" })
      .eq("source", "sam_gov")
      .neq("status", "archived")
      .lt("response_deadline", nowIso)
      .select("id");
    const undatedCutoff = new Date(Date.now() - UNDATED_ARCHIVE_AFTER_DAYS * DAY_MS).toISOString().slice(0, 10);
    const { data: staleUndated } = await supabase
      .from("opportunities")
      .update({ status: "archived", archived_at: nowIso, archived_reason: "No response deadline; posted over 90 days ago" })
      .eq("source", "sam_gov")
      .neq("status", "archived")
      .is("response_deadline", null)
      .lt("posted_date", undatedCutoff)
      .select("id");
    archivedCount = (pastDeadline?.length ?? 0) + (staleUndated?.length ?? 0);

    const status: SyncRunSummary["status"] = failedCount === 0 ? "success" : createdCount + updatedCount > 0 ? "partial" : "failed";
    await supabase
      .from("opportunity_sync_runs")
      .update({
        status,
        finished_at: new Date().toISOString(),
        pages_fetched: pagesFetched,
        records_seen: recordsSeen,
        created_count: createdCount,
        updated_count: updatedCount,
        skipped_count: skippedCount,
        failed_count: failedCount,
        archived_count: archivedCount,
        error_summary: failedCount > 0 ? `${failedCount} record(s) failed to sync` : null,
      })
      .eq("id", run.id);

    return { runId: run.id, status, pagesFetched, recordsSeen, createdCount, updatedCount, skippedCount, failedCount, archivedCount };
  } catch (err) {
    await supabase
      .from("opportunity_sync_runs")
      .update({
        status: "failed",
        finished_at: new Date().toISOString(),
        pages_fetched: pagesFetched,
        records_seen: recordsSeen,
        created_count: createdCount,
        updated_count: updatedCount,
        skipped_count: skippedCount,
        failed_count: failedCount,
        error_summary: err instanceof Error ? err.message : String(err),
      })
      .eq("id", run.id);
    throw err;
  }
}
