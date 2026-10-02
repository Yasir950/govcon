"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useState, type CSSProperties, type ReactNode } from "react";
import {
  deleteCompanyDocumentAction,
  getCompanyDocumentDownloadUrlAction,
  saveCompanyDocumentAction,
  setCompanyDocumentVisibilityAction,
} from "@/app/companies/document-actions";
import {
  deletePastPerformanceAction,
  reorderPastPerformanceAction,
  setPastPerformanceStatusAction,
} from "@/app/companies/past-performance-actions";
import { createCompanyPostAction, deleteCompanyPostAction } from "@/app/companies/post-actions";
import { createClient as createBrowserClient } from "@/lib/supabase/client";
import { useToast } from "@/components/toast-provider";
import { ScrollableTabStrip } from "@/components/companies/ScrollableTabStrip";
import { CompanyAnalyticsPanel } from "@/components/companies/CompanyAnalyticsPanel";
import { CompanyReviewsPanel } from "@/components/companies/CompanyReviewsPanel";
import { JobBadges } from "@/components/jobs/JobBadges";
import { BadgeCheck } from "lucide-react";
import { CERT_LABELS } from "@/lib/certifications";
import { PAST_PERFORMANCE_ROLE_LABELS } from "@/lib/past-performance";
import type { Company, CompanyCertification, Job, Opportunity } from "@/lib/landing-data";
import type {
  CompanyAnalytics,
  CompanyDocumentItem,
  CompanyPastPerformanceItem,
  CompanyPostItem,
  CompanyReviewItem,
  CompanyTeamMember,
} from "@/lib/supabase/queries";
import type { Viewer } from "@/lib/supabase/viewer";

const TABS = [
  "overview",
  "capabilities",
  "services",
  "past-performance",
  "team",
  "posts",
  "opportunities",
  "documents",
  "reviews",
  "analytics",
] as const;
type Tab = (typeof TABS)[number];

const TAB_LABEL: Record<Tab, string> = {
  overview: "Overview",
  capabilities: "Capabilities",
  services: "Services",
  "past-performance": "Past Performance",
  team: "Team",
  posts: "Posts",
  opportunities: "Opportunities",
  documents: "Documents",
  reviews: "Reviews",
  analytics: "Analytics",
};

function truncate(text: string, max: number): string {
  return text.length > max ? `${text.slice(0, max).trimEnd()}…` : text;
}

function formatPeriod(item: CompanyPastPerformanceItem): string {
  const start = item.periodStart ? new Date(item.periodStart).toLocaleDateString("en-US", { month: "short", year: "numeric" }) : null;
  const end = item.isOngoing ? "Present" : item.periodEnd ? new Date(item.periodEnd).toLocaleDateString("en-US", { month: "short", year: "numeric" }) : null;
  if (start && end) return `${start} – ${end}`;
  return start ?? end ?? "";
}

export function CompanyProfileTabs({
  company,
  certifications,
  pastPerformance,
  team,
  documents,
  posts,
  opportunities,
  jobs,
  reviews,
  analytics,
  isCompanyAdmin,
  viewer,
  initialTab,
}: {
  company: Company;
  certifications: CompanyCertification[];
  pastPerformance: CompanyPastPerformanceItem[];
  team: CompanyTeamMember[];
  documents: CompanyDocumentItem[];
  posts: CompanyPostItem[];
  opportunities: Opportunity[];
  jobs: Job[];
  reviews: CompanyReviewItem[];
  // Only loaded for the company's own admins.
  analytics: CompanyAnalytics | null;
  isCompanyAdmin: boolean;
  viewer: Viewer | null;
  // Read server-side (see the page component) rather than only via
  // useSearchParams() — without a server reader, Next.js treats `?tab=`
  // as not routing-relevant and strips it from the URL on router.replace().
  initialTab?: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const showToast = useToast();
  const requestedTab = initialTab ?? searchParams.get("tab");
  const [activeTab, setActiveTab] = useState<Tab>(TABS.includes(requestedTab as Tab) ? (requestedTab as Tab) : "overview");
  const [pendingId, setPendingId] = useState<string | null>(null);

  // A link to this same page with a different ?tab= (e.g. the header's
  // rating metric -> Reviews) re-renders the server tree but keeps this
  // component mounted, so follow the new tab explicitly.
  const [syncedTab, setSyncedTab] = useState(initialTab);
  if (syncedTab !== initialTab) {
    setSyncedTab(initialTab);
    if (initialTab && TABS.includes(initialTab as Tab)) setActiveTab(initialTab as Tab);
  }

  const [postDraft, setPostDraft] = useState("");
  const [postImageUrl, setPostImageUrl] = useState<string | null>(null);
  const [postUploading, setPostUploading] = useState(false);
  const [postSubmitting, setPostSubmitting] = useState(false);

  const [docName, setDocName] = useState("");
  const [docPublic, setDocPublic] = useState(false);
  const [docUploading, setDocUploading] = useState(false);

  async function handlePostImagePicked(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file || !viewer) return;
    if (!file.type.startsWith("image/")) return showToast("Choose an image file.");
    if (file.size > 10 * 1024 * 1024) return showToast("Image must be smaller than 10MB.");
    setPostUploading(true);
    try {
      const supabase = createBrowserClient();
      const extension = file.name.split(".").pop() || "jpg";
      const path = `${viewer.id}/${crypto.randomUUID()}.${extension}`;
      const { error } = await supabase.storage.from("post-images").upload(path, file, { contentType: file.type });
      if (error) return showToast("Upload failed. Please try again.");
      const { data } = supabase.storage.from("post-images").getPublicUrl(path);
      setPostImageUrl(data.publicUrl);
    } finally {
      setPostUploading(false);
    }
  }

  async function submitCompanyPost() {
    if (!postDraft.trim()) return;
    setPostSubmitting(true);
    const result = await createCompanyPostAction(company.id, company.slug, postDraft, postImageUrl ?? "");
    setPostSubmitting(false);
    if (result.error) {
      showToast(result.error);
      return;
    }
    setPostDraft("");
    setPostImageUrl(null);
    showToast("Posted");
    router.refresh();
  }

  async function removeCompanyPost(postId: string) {
    if (!confirm("Delete this post permanently?")) return;
    setPendingId(postId);
    const result = await deleteCompanyPostAction(postId, company.slug);
    setPendingId(null);
    if (result.error) {
      showToast(result.error);
      return;
    }
    router.refresh();
  }

  async function handleDocumentPicked(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    if (file.size > 10 * 1024 * 1024) return showToast("File must be smaller than 10MB.");
    setDocUploading(true);
    try {
      const supabase = createBrowserClient();
      const extension = file.name.split(".").pop() || "pdf";
      const path = `${company.id}/${crypto.randomUUID()}.${extension}`;
      const { error: uploadError } = await supabase.storage.from("company-documents").upload(path, file, { contentType: file.type });
      if (uploadError) return showToast("Upload failed. Please try again.");
      const result = await saveCompanyDocumentAction(company.id, company.slug, docName || file.name, path, docPublic);
      if (result.error) {
        showToast(result.error);
        return;
      }
      setDocName("");
      setDocPublic(false);
      showToast("Document uploaded");
      router.refresh();
    } finally {
      setDocUploading(false);
    }
  }

  async function removeDocument(doc: CompanyDocumentItem) {
    if (!confirm("Delete this document permanently?")) return;
    setPendingId(doc.id);
    const result = await deleteCompanyDocumentAction(doc.id, doc.storagePath, company.slug);
    setPendingId(null);
    if (result.error) {
      showToast(result.error);
      return;
    }
    router.refresh();
  }

  async function toggleDocumentVisibility(doc: CompanyDocumentItem) {
    setPendingId(doc.id);
    const result = await setCompanyDocumentVisibilityAction(doc.id, !doc.isPublic, company.slug);
    setPendingId(null);
    if (result.error) {
      showToast(result.error);
      return;
    }
    router.refresh();
  }

  async function downloadDocument(doc: CompanyDocumentItem) {
    const result = await getCompanyDocumentDownloadUrlAction(doc.storagePath);
    if (result.error || !result.url) {
      showToast(result.error ?? "Couldn't generate a download link.");
      return;
    }
    window.open(result.url, "_blank", "noopener,noreferrer");
  }

  async function togglePublish(item: CompanyPastPerformanceItem) {
    setPendingId(item.id);
    const result = await setPastPerformanceStatusAction(item.id, item.status === "published" ? "draft" : "published");
    setPendingId(null);
    if (result.error) {
      showToast(result.error);
      return;
    }
    router.refresh();
  }

  async function removeRecord(id: string) {
    if (!confirm("Delete this record permanently?")) return;
    setPendingId(id);
    const result = await deletePastPerformanceAction(id);
    setPendingId(null);
    if (result.error) {
      showToast(result.error);
      return;
    }
    router.refresh();
  }

  async function move(id: string, direction: "up" | "down") {
    setPendingId(id);
    await reorderPastPerformanceAction(id, direction, company.id);
    setPendingId(null);
    router.refresh();
  }

  function selectTab(tab: Tab) {
    setActiveTab(tab);
    // router.replace() is intentionally NOT used here: this Next.js
    // version's client router determines whether a search-param change is
    // "routing-relevant" by whether the server-rendered tree depends on
    // it, and silently strips the query string from the committed URL
    // when it doesn't (confirmed by inspecting the actual history.
    // replaceState calls it issues). Since switching tabs is pure client
    // state with no server round-trip, calling the History API directly
    // keeps the URL shareable/bookmarkable without fighting that
    // heuristic.
    const params = new URLSearchParams(searchParams.toString());
    params.set("tab", tab);
    window.history.replaceState(window.history.state, "", `${pathname}?${params.toString()}`);
  }

  const visibleTabs = TABS.filter((t) => t !== "analytics" || isCompanyAdmin);

  // Overview key facts. Website sits in the cell directly below Business
  // Size (4-col desktop grid), with Contract Vehicles / Core Specialties
  // flowing right after it; anything else fills in around them.
  const overviewKeys: { label: string; value: ReactNode; style?: CSSProperties }[] = [
    company.legalName && { label: "Legal Name", value: company.legalName },
    company.yearFounded && { label: "Year Founded", value: company.yearFounded },
    company.companySize && { label: "Business Size", value: company.companySize },
    company.ownership && { label: "Ownership", value: company.ownership },
    company.uei && { label: "UEI", value: company.uei },
    company.cageCode && { label: "CAGE Code", value: company.cageCode },
    company.dunsNumber && { label: "DUNS", value: company.dunsNumber },
  ].filter((k) => !!k) as { label: string; value: ReactNode }[];
  const followOnKeys: { label: string; value: ReactNode; style?: CSSProperties }[] = [
    company.website && {
      label: "Website",
      value: (
        <a
          href={/^https?:\/\//i.test(company.website) ? company.website : `https://${company.website}`}
          target="_blank"
          rel="noreferrer"
          className="link-btn"
        >
          {company.website.replace(/^https?:\/\//i, "").replace(/\/$/, "")}
        </a>
      ),
    },
    company.contractVehicles.length > 0 && {
      label: "Contract Vehicles",
      value: truncate(company.contractVehicles.join(", "), 250),
    },
    company.coreSpecialties && {
      label: "Core Specialties",
      value: truncate(company.coreSpecialties, 150),
    },
  ].filter((k) => !!k) as { label: string; value: ReactNode }[];
  if (followOnKeys.length > 0) {
    const sizeIndex = overviewKeys.findIndex((k) => k.label === "Business Size");
    if (sizeIndex === -1) {
      overviewKeys.push(...followOnKeys);
    } else {
      const insertAt = Math.min(sizeIndex + 4, overviewKeys.length);
      // When there aren't enough keys to fill the gap, pin the first one to
      // Business Size's column (desktop only -- see .key-below-size).
      followOnKeys[0].style = { ["--below-col" as string]: (sizeIndex % 4) + 1 };
      overviewKeys.splice(insertAt, 0, ...followOnKeys);
    }
  }

  return (
    <div>
      <ScrollableTabStrip activeKey={activeTab}>
        {visibleTabs.map((tab) => (
          <button
            key={tab}
            role="tab"
            aria-selected={activeTab === tab}
            className={`cp-tab${activeTab === tab ? " active" : ""}`}
            onClick={() => selectTab(tab)}
          >
            {TAB_LABEL[tab]}
          </button>
        ))}
      </ScrollableTabStrip>

      {activeTab === "overview" && (
        <section className="card panel">
          <h2 className="section-title" style={{ whiteSpace: "normal" }}>About {company.name}</h2>
          {company.tagline && (
            <p style={{ fontWeight: 400, marginTop: 8 }}>{company.tagline}</p>
          )}
          <p className="meta" style={{ marginTop: 8 }}>
            {company.overview || company.summary}
          </p>
          <div className="key-grid" style={{ marginTop: 20 }}>
            {overviewKeys.map(({ label, value, style }) => (
              <div className={style ? "key key-below-size" : "key"} key={label} style={style}>
                <small>{label}</small>
                <strong style={{ fontWeight: 400, overflowWrap: "anywhere" }}>{value}</strong>
              </div>
            ))}
          </div>
          {certifications.length > 0 && (
            <>
              <h3 style={{ marginTop: 24 }}>Certifications</h3>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 10 }}>
                {certifications.map((c) => {
                  const label = c.certType === "other" ? c.customLabel : CERT_LABELS[c.certType];
                  return c.status === "verified" ? (
                    <span
                      className="tag cert-chip is-verified"
                      key={c.id}
                      title={`Verified by GovConUnited against SBA and SAM.gov records${c.verifiedAt ? ` on ${new Date(c.verifiedAt).toLocaleDateString()}` : ""}`}
                    >
                      <BadgeCheck size={14} aria-hidden="true" /> Verified {label}
                    </span>
                  ) : (
                    <span className="tag cert-chip" key={c.id}>
                      {label} — {c.status === "lapsed" ? "lapsed" : "self-reported"}
                    </span>
                  );
                })}
              </div>
            </>
          )}
          {company.serviceAreas.length > 0 && (
            <>
              <h3>Service Areas</h3>
              <p className="meta">{company.serviceAreas.join(", ")}</p>
            </>
          )}
          {company.agenciesServed.length > 0 && (
            <>
              <h3>Agencies Served</h3>
              <p className="meta">{company.agenciesServed.join(", ")}</p>
            </>
          )}
          {(company.naicsCodes.length > 0 || company.pscCodes.length > 0) && (
            <>
              <h3>NAICS / PSC</h3>
              <p className="meta">
                {company.naicsCodes.join(", ")}
                {company.naicsCodes.length > 0 && company.pscCodes.length > 0 ? " · " : ""}
                {company.pscCodes.join(", ")}
              </p>
            </>
          )}
        </section>
      )}

      {activeTab === "capabilities" && (
        <section className="card panel">
          <h2 className="section-title">Capabilities</h2>
          <ul>
            {company.capabilities
              .split(/,\s*/)
              .filter(Boolean)
              .map((c) => (
                <li key={c}>{c}</li>
              ))}
          </ul>
          {company.keywords.length > 0 && (
            <>
              <h3>Keywords</h3>
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                {company.keywords.map((k) => (
                  <span className="tag" key={k}>
                    {k}
                  </span>
                ))}
              </div>
            </>
          )}
        </section>
      )}

      {activeTab === "services" && (
        <section className="card panel">
          <h2 className="section-title">Services</h2>
          {company.services.length > 0 ? (
            <ul>
              {company.services.map((s) => (
                <li key={s}>{s}</li>
              ))}
            </ul>
          ) : (
            <p className="meta">No services listed yet.</p>
          )}
        </section>
      )}

      {activeTab === "past-performance" && (
        <section className="card panel">
          <div className="panel-head">
            <h2 className="section-title">Past Performance</h2>
            {isCompanyAdmin && (
              <Link href={`/companies/${company.slug}/past-performance/new`} className="btn btn-outline btn-sm">
                + Add Record
              </Link>
            )}
          </div>
          {pastPerformance.length === 0 ? (
            <p className="meta">No past performance records published yet.</p>
          ) : (
            <div style={{ display: "grid", gap: 14 }}>
              {pastPerformance.map((pp) => (
                <div key={pp.id} className="card panel" style={{ background: "var(--o-line, #f7f9fc)" }}>
                  <strong>
                    {pp.title}
                    {isCompanyAdmin && pp.status !== "published" && <span className="tag" style={{ marginLeft: 8 }}>{pp.status}</span>}
                  </strong>
                  <div className="meta">
                    {pp.customerAgency} · {PAST_PERFORMANCE_ROLE_LABELS[pp.role]}
                    {formatPeriod(pp) && ` · ${formatPeriod(pp)}`}
                  </div>
                  {pp.valueDisplay && <div className="meta">Value: {pp.valueDisplay}</div>}
                  {pp.scope && <p>{pp.scope}</p>}
                  {pp.outcomes && (
                    <>
                      <h4 style={{ marginBottom: 4 }}>Outcomes</h4>
                      <p className="meta">{pp.outcomes}</p>
                    </>
                  )}
                  {pp.technologies.length > 0 && <p className="meta">Technologies: {pp.technologies.join(", ")}</p>}
                  {isCompanyAdmin && (
                    <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 8 }}>
                      <Link href={`/companies/${company.slug}/past-performance/${pp.id}/edit`} className="btn btn-outline btn-sm">
                        Edit
                      </Link>
                      <button className="btn btn-outline btn-sm" disabled={pendingId === pp.id} onClick={() => togglePublish(pp)}>
                        {pp.status === "published" ? "Unpublish" : "Publish"}
                      </button>
                      <button className="btn btn-outline btn-sm" disabled={pendingId === pp.id} onClick={() => move(pp.id, "up")}>
                        ↑
                      </button>
                      <button className="btn btn-outline btn-sm" disabled={pendingId === pp.id} onClick={() => move(pp.id, "down")}>
                        ↓
                      </button>
                      <button
                        className="btn btn-outline btn-sm"
                        style={{ color: "var(--o-red)", borderColor: "var(--o-red)" }}
                        disabled={pendingId === pp.id}
                        onClick={() => removeRecord(pp.id)}
                      >
                        Delete
                      </button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
          <div style={{ marginTop: 14 }}>
            <Link href={`/companies/${company.slug}/summary`} className="link-btn" target="_blank" rel="noopener noreferrer">
              View printable capabilities & past performance summary →
            </Link>
          </div>
        </section>
      )}

      {activeTab === "team" && (
        <section className="card panel">
          <h2 className="section-title">Team</h2>
          {team.length === 0 ? (
            <p className="meta">No team members listed.</p>
          ) : (
            <div style={{ display: "grid", gap: 10 }}>
              {team.map((m) => (
                <div key={m.profileId} className="mini-row">
                  <Link href={`/network/${m.profileId}`} className="link-btn" style={{ flex: 1 }}>
                    {m.name}
                  </Link>
                  <span className="meta">{m.role === "owner" ? "Owner" : "Admin"}</span>
                </div>
              ))}
            </div>
          )}
        </section>
      )}

      {activeTab === "posts" && (
        <section className="card panel">
          <h2 className="section-title">Posts</h2>
          {isCompanyAdmin && (
            <div style={{ display: "grid", gap: 8, marginBottom: 16, paddingBottom: 16, borderBottom: "1px solid var(--o-line)" }}>
              <textarea
                className="textarea"
                placeholder={`Share an update as ${company.name}...`}
                value={postDraft}
                onChange={(e) => setPostDraft(e.target.value)}
              />
              {postImageUrl && (
                <img src={postImageUrl} alt="" style={{ width: "100%", maxHeight: 220, objectFit: "cover", borderRadius: 8 }} />
              )}
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, flexWrap: "wrap" }}>
                <input type="file" accept="image/*" onChange={handlePostImagePicked} disabled={postUploading} style={{ fontSize: ".8rem" }} />
                <button className="btn btn-primary btn-sm" disabled={postSubmitting || postUploading || !postDraft.trim()} onClick={submitCompanyPost}>
                  {postSubmitting ? "Posting…" : "Post"}
                </button>
              </div>
            </div>
          )}
          {posts.length === 0 ? (
            <p className="meta">Posts by this company will appear here.</p>
          ) : (
            <div style={{ display: "grid", gap: 14 }}>
              {posts.map((p) => (
                <div key={p.id} className="card panel" style={{ background: "var(--o-line, #f7f9fc)" }}>
                  <p style={{ whiteSpace: "pre-wrap", margin: 0 }}>{p.body}</p>
                  {p.coverImageUrl && (
                    <img src={p.coverImageUrl} alt="" style={{ width: "100%", maxHeight: 260, objectFit: "cover", borderRadius: 8, marginTop: 10 }} />
                  )}
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 10 }}>
                    <span className="meta">{new Date(p.postedAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}</span>
                    {viewer?.id === p.authorProfileId && (
                      <button
                        className="btn btn-outline btn-sm"
                        style={{ color: "var(--o-red)", borderColor: "var(--o-red)" }}
                        disabled={pendingId === p.id}
                        onClick={() => removeCompanyPost(p.id)}
                      >
                        Delete
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      )}

      {activeTab === "opportunities" && (
        <section className="card panel">
          <h2 className="section-title">Opportunities & Jobs</h2>
          {opportunities.length === 0 && jobs.length === 0 ? (
            <p className="meta">Nothing open right now.</p>
          ) : (
            <>
              {opportunities.map((o) => (
                <div key={o.route} className="mini-row" style={{ alignItems: "center" }}>
                  <Link href={`/${o.route}`} style={{ flex: 1, minWidth: 0, color: "inherit", textDecoration: "none" }}>
                    {o.title}
                    <span className="meta" style={{ display: "block" }}>
                      Opportunity · Due {o.due}
                    </span>
                  </Link>
                  {isCompanyAdmin && (
                    <Link href={`/companies/${company.slug}/opportunities/${o.route.split("/")[1]}/responses`} className="btn btn-outline btn-sm">
                      Responses
                    </Link>
                  )}
                </div>
              ))}
              {jobs.map((j) => (
                <div key={j.route} className="mini-row" style={{ alignItems: "center" }}>
                  <Link href={`/${j.route}`} style={{ flex: 1, minWidth: 0, color: "inherit", textDecoration: "none" }}>
                    {j.title}{" "}
                    <JobBadges featured={j.featured} closed={j.closedAt != null} />
                    <span className="meta" style={{ display: "block" }}>
                      Job · {j.location}
                    </span>
                  </Link>
                  {isCompanyAdmin && j.applicationType === "internal" && (
                    <Link href={`/companies/${company.slug}/jobs/${j.route.split("/")[1]}/applicants`} className="btn btn-outline btn-sm">
                      Applicants
                    </Link>
                  )}
                </div>
              ))}
            </>
          )}
        </section>
      )}

      {activeTab === "documents" && (
        <section className="card panel">
          <h2 className="section-title">Documents</h2>
          {isCompanyAdmin && (
            <div style={{ display: "grid", gap: 8, marginBottom: 16, paddingBottom: 16, borderBottom: "1px solid var(--o-line)" }}>
              <div className="form-grid">
                <label className="label">
                  Document name
                  <input className="field" value={docName} onChange={(e) => setDocName(e.target.value)} placeholder="e.g. Capability Statement" />
                </label>
                <label className="label" style={{ display: "flex", alignItems: "center", flexDirection: "row", gap: 8, marginTop: 20 }}>
                  <input type="checkbox" checked={docPublic} onChange={(e) => setDocPublic(e.target.checked)} />
                  Visible to everyone (unchecked = internal to your team)
                </label>
              </div>
              <input type="file" accept=".pdf,.doc,.docx,image/*" onChange={handleDocumentPicked} disabled={docUploading} style={{ fontSize: ".8rem" }} />
              {docUploading && <span className="meta">Uploading…</span>}
            </div>
          )}
          {documents.length === 0 ? (
            <p className="meta">No documents shared yet.</p>
          ) : (
            <div style={{ display: "grid", gap: 8 }}>
              {documents.map((d) => (
                <div key={d.id} className="mini-row" style={{ alignItems: "center" }}>
                  <span style={{ flex: 1, minWidth: 0 }}>{d.name}</span>
                  {!d.isPublic && <span className="tag">Internal</span>}
                  <button className="btn btn-outline btn-sm" onClick={() => downloadDocument(d)}>
                    Download
                  </button>
                  {isCompanyAdmin && (
                    <>
                      <button className="btn btn-outline btn-sm" disabled={pendingId === d.id} onClick={() => toggleDocumentVisibility(d)}>
                        {d.isPublic ? "Make Internal" : "Make Public"}
                      </button>
                      <button
                        className="btn btn-outline btn-sm"
                        style={{ color: "var(--o-red)", borderColor: "var(--o-red)" }}
                        disabled={pendingId === d.id}
                        onClick={() => removeDocument(d)}
                      >
                        Delete
                      </button>
                    </>
                  )}
                </div>
              ))}
            </div>
          )}
        </section>
      )}

      {activeTab === "reviews" && (
        <CompanyReviewsPanel
          companyId={company.id}
          companySlug={company.slug}
          companyName={company.name}
          initialReviews={reviews}
          viewer={viewer}
          isCompanyAdmin={isCompanyAdmin}
        />
      )}

      {activeTab === "analytics" && isCompanyAdmin && <CompanyAnalyticsPanel companyId={company.id} initialAnalytics={analytics} />}
    </div>
  );
}
