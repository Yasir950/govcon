import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { fetchSamEntity, samCertEvidence, samConfigured, samSnapshot, type SamEntity } from "@/lib/sam-entity";
import { VERIFIABLE_CERTS } from "@/lib/learning-status-types";
import type { Json } from "@/lib/supabase/types";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

// Daily SAM.gov check of verified company certifications (Vercel Cron, same
// CRON_SECRET bearer as the other /api/cron routes). A certification lapses
// (badge revoked, admins notified) only when SAM.gov positively shows it
// gone or past its SBA exit date; a missing UEI or a failed lookup changes
// nothing. Expiry and yearly re-verification are handled in the database by
// the certifications-daily pg_cron job.
const BATCH = 100;
const RECHECK_DAYS = 6;

export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!samConfigured()) return NextResponse.json({ skipped: "SAM_GOV_API_KEY is not set" });

  const admin = createAdminClient();
  const since = new Date(Date.now() - RECHECK_DAYS * 86400000).toISOString();
  const { data: certs, error } = await admin
    .from("company_certifications")
    .select("id, cert_type, company_id, expires_on, companies!inner(uei, name)")
    .eq("status", "verified")
    .in("cert_type", [...VERIFIABLE_CERTS])
    .or(`last_checked_at.is.null,last_checked_at.lt.${since}`)
    .order("last_checked_at", { ascending: true, nullsFirst: true })
    .limit(BATCH);
  if (error) {
    console.error("[certification-check] load failed", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const today = new Date().toLocaleDateString("en-CA", { timeZone: "America/New_York" });
  const entities = new Map<string, SamEntity | null>();
  const summary = { checked: 0, lapsed: 0, no_uei: 0, not_found: 0, failed: 0 };

  for (const c of certs ?? []) {
    const uei = c.companies?.uei?.trim().toUpperCase();
    if (!uei) {
      summary.no_uei++;
      await admin
        .from("company_certifications")
        .update({ last_checked_at: new Date().toISOString(), sam_check: { skipped: "no_uei", checked_at: new Date().toISOString() } })
        .eq("id", c.id);
      continue;
    }
    if (!entities.has(uei)) {
      try {
        entities.set(uei, await fetchSamEntity(uei));
      } catch (err) {
        console.error("[certification-check] SAM lookup failed", uei, err);
        entities.set(uei, null);
      }
    }
    const entity = entities.get(uei);
    if (!entity) {
      summary.failed++;
      continue;
    }
    summary.checked++;
    const evidence = samCertEvidence(c.cert_type, entity, today);
    const snapshot = samSnapshot(entity, evidence) as unknown as Json;
    if (!entity.found) summary.not_found++;

    if (evidence.present === false) {
      const { error: lapseError } = await admin.rpc("certification_lapse", {
        p_cert: c.id,
        p_reason: `${evidence.detail} (checked ${today}).`,
        p_sam: snapshot,
      });
      if (lapseError) console.error("[certification-check] lapse failed", c.id, lapseError);
      else summary.lapsed++;
      continue;
    }

    const patch: { last_checked_at: string; sam_check: Json; expires_on?: string } = {
      last_checked_at: new Date().toISOString(),
      sam_check: snapshot,
    };
    // Keep the SBA exit date as the expiry, so the daily job lapses it on time.
    if (evidence.exitDate && evidence.exitDate > today && evidence.exitDate !== c.expires_on) patch.expires_on = evidence.exitDate;
    const { error: updateError } = await admin.from("company_certifications").update(patch).eq("id", c.id);
    if (updateError) console.error("[certification-check] update failed", c.id, updateError);
  }

  return NextResponse.json(summary);
}
