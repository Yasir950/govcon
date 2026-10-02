import { createClient } from "@/lib/supabase/server";
import type { TrackingStage } from "@/lib/bid-tracker-plan";
import { normalizeJobClearance } from "@/lib/clearance";
import { normalizeOpenTo, openToMatchScore, publicOpenTo } from "@/lib/open-to";
import type { PastPerformanceRole } from "@/lib/past-performance";
import type {
  Community,
  CommunityMembership,
  CommunityMembershipStatus,
  CommunityMemberEntry,
  Company,
  CompanyCertification,
  Conversation,
  EditHistoryEntry,
  EducationRecord,
  EventAgendaItem,
  EventAttendee,
  EventItem,
  EventRegistrationStatus,
  EventSpeaker,
  Job,
  JobCategory,
  Member,
  MessageItem,
  ModerationLogEntry,
  NetworkMember,
  Opportunity,
  Post,
  PostComment,
  ProfileComment,
  PublicProfile,
  Resource,
  Testimonial,
  WorkExperience,
} from "@/lib/landing-data";
import type { Tables } from "./types";

function formatDueDate(isoTimestamp: string | null): string {
  if (!isoTimestamp) return "No deadline specified";
  return new Date(isoTimestamp).toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}

// An event with no explicit end time (composer/admin now ask for one, but
// older rows may not have it) is treated as running 24 hours from its
// start — long enough that a same-day event doesn't vanish from public
// listings the moment it begins, only once it's genuinely likely over. One
// with a real end time is judged by that instead.
function hasEventEnded(startsAt: string, endsAt: string | null): boolean {
  const now = Date.now();
  if (endsAt) return new Date(endsAt).getTime() < now;
  return new Date(startsAt).getTime() + 24 * 60 * 60 * 1000 < now;
}

// All events currently store "ET" as their timezone_label (free text, not
// an IANA zone — see queries.ts audit notes), so every date/time derived
// from starts_at/ends_at is explicitly formatted in America/New_York
// rather than the server process's own local timezone, which would
// otherwise silently shift the displayed hour.
const EVENT_TIME_ZONE = "America/New_York";

function formatEventWhen(startsAt: string, timezoneLabel: string, location: string | null): string {
  const date = new Date(startsAt);
  const datePart = date.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric", timeZone: EVENT_TIME_ZONE });
  const timePart = date.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", timeZone: EVENT_TIME_ZONE });
  const base = `${datePart} · ${timePart} ${timezoneLabel}`;
  return location ? `${base} · ${location}` : base;
}

const eventKindLabel: Record<string, string> = {
  webinar: "Live Webinar",
  qa: "Q&A",
  in_person: "In-Person Event",
  virtual_conference: "Virtual Conference",
  networking: "Networking",
  trade_show: "Trade Show",
  workshop: "Workshop",
  training: "Training",
};

function formatRelativeTime(isoTimestamp: string): string {
  const diffMs = Date.now() - new Date(isoTimestamp).getTime();
  const hours = Math.max(1, Math.round(diffMs / (1000 * 60 * 60)));
  if (hours < 24) return `${hours}h`;
  const days = Math.round(hours / 24);
  return `${days}d`;
}

type CompanyRow = Tables<"companies">;
export type OpportunityRow = Tables<"opportunities"> & {
  companies: CompanyRow | null;
  opportunity_contacts: Tables<"opportunity_contacts">[];
  opportunity_attachments: Tables<"opportunity_attachments">[];
};
type JobRow = Tables<"jobs"> & { companies: CompanyRow; job_categories: { title: string } | null };
type PostRow = Tables<"posts"> & {
  post_media: Pick<Tables<"post_media">, "kind" | "storage_path" | "sort_order">[];
  poll_options: (Pick<Tables<"poll_options">, "id" | "label" | "sort_order"> & {
    poll_votes: Pick<Tables<"poll_votes">, "profile_id">[];
  })[];
};

// A draft/scheduled-in-the-future/archived row must never reach the public
// site — an admin can publish/schedule/archive any managed table
// (20260919000100/000200/000300/000400 migrations) without a code edit,
// and this is the one filter every public read applies so that's real.
const PUBLISHED_FILTER = () => `status.eq.published,and(status.eq.scheduled,scheduled_at.lte.${new Date().toISOString()})`;

export async function getCompanies(): Promise<Company[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("companies")
    .select("*, company_certifications(cert_type, status)")
    .or(PUBLISHED_FILTER())
    .order("name");
  if (error) throw error;

  return (data ?? []).map((c) => ({
    verifiedCertifications: [
      ...new Set((c.company_certifications ?? []).filter((x) => x.status === "verified").map((x) => x.cert_type)),
    ],
    id: c.id,
    route: `companies/${c.slug}`,
    slug: c.slug,
    name: c.name,
    legalName: c.legal_name,
    tagline: c.tagline,
    overview: c.overview,
    type: c.type,
    location: c.location,
    capabilities: c.capabilities,
    certifications: c.certifications,
    summary: c.summary,
    logo: c.logo_initials,
    logoUrl: c.logo_url,
    coverImageUrl: c.cover_image_url,
    verified: c.verified,
    isPartner: c.is_partner,
    partnerType: c.partner_type,
    tags: c.tags,
    website: c.website,
    businessEmail: c.business_email,
    businessEmailVerified: c.business_email_verified_at != null,
    phone: c.phone,
    yearFounded: c.year_founded,
    companySize: c.company_size,
    ownership: c.ownership,
    serviceAreas: c.service_areas ?? [],
    agenciesServed: c.agencies_served ?? [],
    contractVehicles: c.contract_vehicles ?? [],
    contractVehiclesNote: c.contract_vehicles_note,
    coreSpecialties: c.core_specialties,
    keywords: c.keywords ?? [],
    services: c.services ?? [],
    naicsCodes: c.naics_codes ?? [],
    pscCodes: c.psc_codes ?? [],
    uei: c.uei,
    cageCode: c.cage_code,
    dunsNumber: c.duns_number,
    partnerCategory: c.partner_category,
    submittedBy: c.submitted_by,
  }));
}

const OPPORTUNITY_SELECT = "*, companies(*), opportunity_contacts(*), opportunity_attachments(*)";

// A SAM.gov-sourced federal notice has no platform company attached
// (opportunities.company_id is nullable, 20260921000700) -- it's posted
// by a government agency, so the agency/subagency name stands in for
// "company" and a plain "GOV" initials badge stands in for a logo.
export function mapOpportunityRow(o: OpportunityRow): Opportunity {
  return {
    id: o.id,
    route: `opportunities/${o.slug}`,
    title: o.title,
    companyId: o.company_id,
    companySlug: o.companies?.slug ?? null,
    company: o.companies?.name ?? o.agency ?? "Government Agency",
    location: o.location,
    due: formatDueDate(o.response_deadline),
    naics: o.naics_code,
    description: o.description,
    logo: o.companies?.logo_initials ?? "GOV",
    logoUrl: o.companies?.logo_url ?? null,
    tags: o.tags,
    status: o.status,
    featured: o.featured,
    closedAt: o.closed_at ?? null,
    source: o.source as "manual" | "sam_gov",
    noticeId: o.notice_id,
    solicitationNumber: o.solicitation_number,
    agency: o.agency,
    subagency: o.subagency,
    office: o.office,
    noticeType: o.notice_type,
    setAsideCode: o.set_aside_code,
    setAsideDescription: o.set_aside_description,
    pscCode: o.psc_code,
    placeCity: o.place_city,
    placeState: o.place_state,
    postedDate: o.posted_date,
    responseDeadlineIso: o.response_deadline,
    sourceUrl: o.source_url,
    contacts: (o.opportunity_contacts ?? [])
      .sort((a, b) => a.sort_order - b.sort_order)
      .map((c) => ({ name: c.name, email: c.email, phone: c.phone, role: c.role })),
    attachments: (o.opportunity_attachments ?? [])
      .sort((a, b) => a.sort_order - b.sort_order)
      .map((a) => ({ label: a.label, url: a.url, kind: a.kind })),
  };
}

// SAM.gov syncs thousands of federal notices a week, and every page filters
// this list client-side — so company/admin-posted listings are always
// returned in full, while federal notices are capped to the most recently
// posted open ones (the soonest-due 500 all close within a day or two). (One uncapped query would also hit PostgREST's max-rows limit
// and silently drop company listings with later deadlines.)
const FEDERAL_LIST_LIMIT = 500;

export async function getOpportunities(): Promise<Opportunity[]> {
  const supabase = await createClient();
  const [manual, federal] = await Promise.all([
    supabase
      .from("opportunities")
      .select(OPPORTUNITY_SELECT)
      .or(PUBLISHED_FILTER())
      .neq("source", "sam_gov")
      .order("response_deadline"),
    supabase
      .from("opportunities")
      .select(OPPORTUNITY_SELECT)
      .or(PUBLISHED_FILTER())
      .eq("source", "sam_gov")
      .or(`response_deadline.gte.${new Date().toISOString()},response_deadline.is.null`)
      .order("posted_date", { ascending: false, nullsFirst: false })
      .limit(FEDERAL_LIST_LIMIT),
  ]);
  if (manual.error) throw manual.error;
  if (federal.error) throw federal.error;

  const deadline = (o: Opportunity) => (o.responseDeadlineIso ? new Date(o.responseDeadlineIso).getTime() : Infinity);
  return ([...(manual.data ?? []), ...(federal.data ?? [])] as OpportunityRow[]).map(mapOpportunityRow).sort((a, b) => deadline(a) - deadline(b));
}

// Published opportunities by id, regardless of the federal-list cap above —
// for views of a member's own saved listings.
export async function getOpportunitiesByIds(ids: string[]): Promise<Opportunity[]> {
  if (ids.length === 0) return [];
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("opportunities")
    .select(OPPORTUNITY_SELECT)
    .in("id", ids)
    .or(PUBLISHED_FILTER())
    .order("response_deadline");
  if (error) throw error;
  return ((data ?? []) as OpportunityRow[]).map(mapOpportunityRow);
}

// The detail page must resolve regardless of publish status -- a member
// who saved a notice before it closed should still be able to open it
// (shown with an "Archived" badge), not get a 404 the moment it archives.
export async function getOpportunityBySlug(slug: string): Promise<Opportunity | null> {
  const supabase = await createClient();
  const { data, error } = await supabase.from("opportunities").select(OPPORTUNITY_SELECT).eq("slug", slug).maybeSingle();
  if (error) throw error;
  if (!data) return null;
  return mapOpportunityRow(data as OpportunityRow);
}

// Archived opportunities are excluded from the main published feed
// (PUBLISHED_FILTER), but a member who tracked one before it closed should
// still see it under the Opportunities page's "Archived" tab — preserving
// their history, per spec 9.1's "preserve authorized member history".
export async function getViewerArchivedOpportunities(profileId: string): Promise<Opportunity[]> {
  const supabase = await createClient();
  const { data: tracked } = await supabase.from("opportunity_tracking").select("opportunity_id").eq("profile_id", profileId);
  const savedIds = (tracked ?? []).map((s) => s.opportunity_id);
  if (savedIds.length === 0) return [];

  const { data, error } = await supabase
    .from("opportunities")
    .select(OPPORTUNITY_SELECT)
    .eq("status", "archived")
    .in("id", savedIds)
    .order("archived_at", { ascending: false });
  if (error) throw error;

  return ((data ?? []) as OpportunityRow[]).map(mapOpportunityRow);
}

export async function getJobs(): Promise<Job[]> {
  const supabase = await createClient();
  const [{ data, error }, { data: counts, error: countsError }] = await Promise.all([
    supabase.from("jobs").select("*, companies(*), job_categories(title)").or(PUBLISHED_FILTER()).order("created_at"),
    supabase.from("job_application_counts").select("job_id, applicant_count"),
  ]);
  if (error) throw error;
  if (countsError) throw countsError;

  const countByJobId = new Map((counts ?? []).map((c) => [c.job_id, c.applicant_count ?? 0]));

  return ((data ?? []) as JobRow[]).map((j) => ({
    id: j.id,
    route: `jobs/${j.slug}`,
    title: j.title,
    company: j.companies.name,
    location: j.location,
    type: j.employment_type,
    workplace: j.workplace,
    experienceLevel: j.experience_level,
    clearance: normalizeJobClearance(j.clearance),
    compensation: j.compensation,
    description: j.description,
    logo: j.companies.logo_initials,
    logoUrl: j.companies.logo_url,
    tags: j.tags,
    applicantCount: countByJobId.get(j.id) ?? 0,
    companyId: j.company_id,
    companySlug: j.companies.slug,
    categoryId: j.category_id,
    categoryTitle: j.job_categories?.title ?? null,
    isProOnly: j.is_pro_only,
    source: j.source as "admin" | "company",
    applicationType: (j.application_type as "internal" | "external") ?? "internal",
    applicationUrl: j.application_url,
    featured: j.featured,
    closedAt: j.closed_at,
  }));
}

export type JobApplicationStatus = "new" | "reviewing" | "interview" | "offer" | "hired" | "rejected" | "withdrawn";

export interface JobApplicant {
  id: string;
  profileId: string;
  name: string;
  status: JobApplicationStatus;
  resumeStoragePath: string | null;
  coverNote: string | null;
  assignedToProfileId: string | null;
  createdAt: string;
  // The contact info the applicant actually typed into the Easy Apply
  // form (may differ from their live profile) — null for applications
  // submitted before this was collected.
  email: string | null;
  phone: string | null;
  streetAddress: string | null;
  city: string | null;
  stateRegion: string | null;
  postalCode: string | null;
  // From the public network_members view — declared level plus whether an
  // admin verified it against uploaded proof.
  clearance: string | null;
  clearanceVerified: boolean;
}

export interface JobApplicationNoteItem {
  id: string;
  applicationId: string;
  authorName: string;
  body: string;
  createdAt: string;
}

export interface JobApplicationStatusChange {
  id: string;
  applicationId: string;
  fromStatus: string | null;
  toStatus: string;
  changedByName: string;
  note: string | null;
  createdAt: string;
}

// Hiring pipeline data for a job's authorized company admins (spec 9.4).
// Applicant names come from network_members (see the teaming-inquiries
// comment above) since profiles' own RLS is owner-only.
export async function getJobApplicantsForJob(jobId: string): Promise<JobApplicant[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("job_applications")
    .select(
      "id, profile_id, status, resume_storage_path, cover_note, assigned_to_profile_id, created_at, email, phone, street_address, city, state_region, postal_code",
    )
    .eq("job_id", jobId)
    .neq("status", "withdrawn")
    .order("created_at", { ascending: false });
  if (error) throw error;

  const profileIds = (data ?? []).map((r) => r.profile_id);
  const { data: members } = profileIds.length
    ? await supabase.from("network_members").select("id, first_name, last_name, clearance, clearance_verified").in("id", profileIds)
    : { data: [] };
  const memberById = new Map((members ?? []).map((m) => [m.id, m]));
  return (data ?? []).map((r) => {
    const m = memberById.get(r.profile_id);
    return {
      id: r.id,
      profileId: r.profile_id,
      name: (m ? `${m.first_name ?? ""} ${m.last_name ?? ""}`.trim() : "") || "Applicant",
      clearance: m?.clearance && m.clearance !== "None" ? m.clearance : null,
      clearanceVerified: m?.clearance_verified === true,
      status: r.status as JobApplicationStatus,
      resumeStoragePath: r.resume_storage_path,
      coverNote: r.cover_note,
      assignedToProfileId: r.assigned_to_profile_id,
      createdAt: r.created_at,
      email: r.email,
      phone: r.phone,
      streetAddress: r.street_address,
      city: r.city,
      stateRegion: r.state_region,
      postalCode: r.postal_code,
    };
  });
}

export async function getResumeSignedUrl(path: string): Promise<string | null> {
  const supabase = await createClient();
  const { data } = await supabase.storage.from("resumes").createSignedUrl(path, 3600);
  return data?.signedUrl ?? null;
}

export async function getJobApplicationNotes(applicationId: string): Promise<JobApplicationNoteItem[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("job_application_notes")
    .select("id, application_id, author_profile_id, body, created_at")
    .eq("application_id", applicationId)
    .order("created_at");
  if (error) throw error;
  const names = await namesByProfileId(supabase, (data ?? []).map((r) => r.author_profile_id));
  return (data ?? []).map((r) => ({
    id: r.id,
    applicationId: r.application_id,
    authorName: names.get(r.author_profile_id) ?? "Team member",
    body: r.body,
    createdAt: r.created_at,
  }));
}

export async function getJobApplicationStatusHistory(applicationId: string): Promise<JobApplicationStatusChange[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("job_application_status_history")
    .select("id, application_id, from_status, to_status, changed_by_profile_id, note, created_at")
    .eq("application_id", applicationId)
    .order("created_at");
  if (error) throw error;
  const names = await namesByProfileId(supabase, (data ?? []).map((r) => r.changed_by_profile_id).filter((id): id is string => Boolean(id)));
  return (data ?? []).map((r) => ({
    id: r.id,
    applicationId: r.application_id,
    fromStatus: r.from_status,
    toStatus: r.to_status,
    changedByName: r.changed_by_profile_id ? (names.get(r.changed_by_profile_id) ?? "Team member") : "Applicant",
    note: r.note,
    createdAt: r.created_at,
  }));
}

export async function getCompanyAdminIds(profileId: string): Promise<Set<string>> {
  const supabase = await createClient();
  const { data, error } = await supabase.from("company_admins").select("company_id").eq("profile_id", profileId);
  if (error) throw error;
  return new Set((data ?? []).map((r) => r.company_id));
}

// "Verified company account": the viewer administers at least one company
// whose verification_status is 'verified'. Gates the Careers "open to"
// choices (lib/open-to.ts), which are never public tags.
export async function isVerifiedCompanyAccount(profileId: string | null): Promise<boolean> {
  if (!profileId) return false;
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("company_admins")
    .select("companies!inner(verification_status)")
    .eq("profile_id", profileId)
    .eq("companies.verification_status", "verified")
    .limit(1);
  if (error) {
    console.error("isVerifiedCompanyAccount failed", error);
    return false;
  }
  return (data ?? []).length > 0;
}

export async function getCompanyCertifications(companyId: string): Promise<CompanyCertification[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("company_certifications")
    .select(
      "id, cert_type, custom_label, evidence_url, verified, status, verified_at, expires_on, reverify_due_on, reverify_requested_at, review_note, lapse_reason",
    )
    .eq("company_id", companyId)
    .order("created_at");
  if (error) throw error;
  return (data ?? []).map((c) => ({
    id: c.id,
    certType: c.cert_type,
    customLabel: c.custom_label,
    evidenceUrl: c.evidence_url,
    verified: c.verified,
    status: c.status as CompanyCertification["status"],
    verifiedAt: c.verified_at,
    expiresOn: c.expires_on,
    reverifyDueOn: c.reverify_due_on,
    reverifyRequestedAt: c.reverify_requested_at,
    reviewNote: c.review_note,
    lapseReason: c.lapse_reason,
  }));
}

export interface CompanyPastPerformanceItem {
  id: string;
  title: string;
  customerAgency: string;
  role: PastPerformanceRole;
  contractNumber: string | null;
  valueDisplay: string | null;
  periodStart: string | null;
  periodEnd: string | null;
  isOngoing: boolean;
  location: string | null;
  naicsCodes: string[];
  pscCodes: string[];
  scope: string | null;
  outcomes: string | null;
  technologies: string[];
  referencesText: string | null;
  attachmentStoragePath: string | null;
  status: "draft" | "pending_review" | "published" | "archived";
  sortOrder: number;
  confidentialNotes?: string | null;
}

// Public tab display never selects confidential_notes -- RLS also
// restricts non-owner/admin callers to published rows, but the explicit
// column list is the primary guardrail per spec 8.3's "never expose
// controlled/proprietary/classified/personal data".
const PAST_PERFORMANCE_PUBLIC_COLUMNS =
  "id, title, customer_agency, role, contract_number, value_display, period_start, period_end, is_ongoing, location, naics_codes, psc_codes, scope, outcomes, technologies, references_text, attachment_storage_path, status, sort_order";

function mapPastPerformanceRow(r: Record<string, unknown>): CompanyPastPerformanceItem {
  return {
    id: r.id as string,
    title: r.title as string,
    customerAgency: r.customer_agency as string,
    role: r.role as PastPerformanceRole,
    contractNumber: r.contract_number as string | null,
    valueDisplay: r.value_display as string | null,
    periodStart: r.period_start as string | null,
    periodEnd: r.period_end as string | null,
    isOngoing: r.is_ongoing as boolean,
    location: r.location as string | null,
    naicsCodes: (r.naics_codes as string[] | null) ?? [],
    pscCodes: (r.psc_codes as string[] | null) ?? [],
    scope: r.scope as string | null,
    outcomes: r.outcomes as string | null,
    technologies: (r.technologies as string[] | null) ?? [],
    referencesText: r.references_text as string | null,
    attachmentStoragePath: r.attachment_storage_path as string | null,
    status: r.status as CompanyPastPerformanceItem["status"],
    sortOrder: r.sort_order as number,
    confidentialNotes: "confidential_notes" in r ? (r.confidential_notes as string | null) : undefined,
  };
}

export async function getCompanyPastPerformance(companyId: string): Promise<CompanyPastPerformanceItem[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("company_past_performance")
    .select(PAST_PERFORMANCE_PUBLIC_COLUMNS)
    .eq("company_id", companyId)
    .eq("status", "published")
    .order("sort_order");
  if (error) throw error;
  return (data ?? []).map(mapPastPerformanceRow);
}

// Owner/admin management view — every status, including confidential_notes.
// RLS (company_admins membership) is what actually keeps this from being
// callable by a non-owner; this is only ever invoked from an
// isCompanyAdmin-gated page.
export async function getCompanyPastPerformanceForManagement(companyId: string): Promise<CompanyPastPerformanceItem[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("company_past_performance")
    .select("*")
    .eq("company_id", companyId)
    .order("sort_order");
  if (error) throw error;
  return (data ?? []).map(mapPastPerformanceRow);
}

export interface CompanyTeamMember {
  profileId: string;
  name: string;
  role: "owner" | "admin";
}

export async function getCompanyTeam(companyId: string): Promise<CompanyTeamMember[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.from("company_admins").select("profile_id, role").eq("company_id", companyId);
  if (error) throw error;
  const names = await namesByProfileId(supabase, (data ?? []).map((r) => r.profile_id));
  return (data ?? [])
    .filter((r) => names.has(r.profile_id))
    .map((r) => ({ profileId: r.profile_id, name: names.get(r.profile_id)!, role: r.role as "owner" | "admin" }));
}

export interface CompanyDocumentItem {
  id: string;
  name: string;
  storagePath: string;
  isPublic: boolean;
  createdAt: string;
}

export async function getCompanyDocuments(companyId: string): Promise<CompanyDocumentItem[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("company_documents")
    .select("id, name, storage_path, is_public, created_at")
    .eq("company_id", companyId)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []).map((d) => ({ id: d.id, name: d.name, storagePath: d.storage_path, isPublic: d.is_public, createdAt: d.created_at }));
}

export async function getCompanyDocumentSignedUrl(storagePath: string): Promise<string | null> {
  const supabase = await createClient();
  const { data } = await supabase.storage.from("company-documents").createSignedUrl(storagePath, 60);
  return data?.signedUrl ?? null;
}

export interface CompanyPostItem {
  id: string;
  body: string;
  coverImageUrl: string | null;
  postedAt: string;
  authorProfileId: string;
}

// Posts published "as" a company page (posts.company_id) — a lighter,
// read-only-for-visitors feed distinct from the main community feed's
// reactions/comments machinery; see createCompanyPostAction. RLS's
// "Posts are readable per audience and publish state" already covers this
// select since these are always audience='public'/status='published'.
export async function getCompanyPosts(companyId: string): Promise<CompanyPostItem[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("posts")
    .select("id, body, cover_image_url, posted_at, author_profile_id")
    .eq("company_id", companyId)
    .eq("status", "published")
    .order("posted_at", { ascending: false });
  if (error) throw error;
  return (data ?? []).map((p) => ({
    id: p.id,
    body: p.body,
    coverImageUrl: p.cover_image_url,
    postedAt: p.posted_at,
    authorProfileId: p.author_profile_id,
  }));
}

export type CompanyReviewRelationship = "teaming_partner" | "prime" | "subcontractor" | "customer" | "employee" | "other";

export interface CompanyReviewItem {
  id: string;
  reviewerId: string;
  reviewerName: string;
  reviewerAvatarUrl: string | null;
  reviewerHeadline: string | null;
  rating: number;
  relationship: CompanyReviewRelationship;
  title: string;
  body: string;
  response: string | null;
  respondedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

// Public reviews on a company page (company_reviews, readable by anyone).
// A reviewer whose account no longer resolves in network_members (e.g.
// unconfirmed email) still counts toward the rating but shows as "A member".
export async function getCompanyReviews(companyId: string): Promise<CompanyReviewItem[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("company_reviews")
    .select("id, reviewer_id, rating, relationship, title, body, response, responded_at, created_at, updated_at")
    .eq("company_id", companyId)
    .order("created_at", { ascending: false });
  if (error) throw error;

  const reviewerIds = [...new Set((data ?? []).map((r) => r.reviewer_id))];
  const { data: members } = reviewerIds.length
    ? await supabase.from("network_members").select("id, first_name, last_name, avatar_url, headline, job_title").in("id", reviewerIds)
    : { data: [] };
  const byId = new Map((members ?? []).filter((m) => m.id).map((m) => [m.id!, m]));

  return (data ?? []).map((r) => {
    const m = byId.get(r.reviewer_id);
    return {
      id: r.id,
      reviewerId: r.reviewer_id,
      reviewerName: m ? `${m.first_name ?? ""} ${m.last_name ?? ""}`.trim() || "A member" : "A member",
      reviewerAvatarUrl: m?.avatar_url ?? null,
      reviewerHeadline: m?.headline || m?.job_title || null,
      rating: r.rating,
      relationship: r.relationship as CompanyReviewRelationship,
      title: r.title,
      body: r.body,
      response: r.response,
      respondedAt: r.responded_at,
      createdAt: r.created_at,
      updatedAt: r.updated_at,
    };
  });
}

export type RecommendationRelationship =
  | "managed_directly"
  | "reported_to"
  | "senior_not_managing"
  | "junior_not_managed"
  | "same_team"
  | "different_teams"
  | "client_of_author"
  | "author_was_client"
  | "teaming_partner"
  | "mentored"
  | "other";

export type RecommendationStatus = "pending" | "visible" | "hidden";

export interface RecommendationPerson {
  id: string;
  name: string;
  avatarUrl: string | null;
  headline: string | null;
}

export interface RecommendationItem {
  id: string;
  author: RecommendationPerson;
  recipient: RecommendationPerson;
  relationship: RecommendationRelationship;
  recipientPosition: string | null;
  body: string;
  status: RecommendationStatus;
  createdAt: string;
  updatedAt: string;
}

export interface RecommendationRequestItem {
  id: string;
  requester: RecommendationPerson;
  recommender: RecommendationPerson;
  recipientPosition: string | null;
  message: string | null;
  createdAt: string;
}

export interface ProfileRecommendations {
  received: RecommendationItem[];
  given: RecommendationItem[];
  // Pending asks involving this profile that the viewer is party to (RLS):
  // all of them on your own profile, only the ones between you and the
  // member when visiting someone else.
  requests: RecommendationRequestItem[];
}

// Recommendations shown on /network/[id]. RLS does the visibility work:
// anyone sees 'visible' ones, while the author and recipient also see
// pending/hidden ones they're part of.
export async function getProfileRecommendations(profileId: string): Promise<ProfileRecommendations> {
  const supabase = await createClient();
  const cols = "id, author_id, recipient_id, relationship, recipient_position, body, status, created_at, updated_at";
  const [recRes, reqRes] = await Promise.all([
    supabase
      .from("profile_recommendations")
      .select(cols)
      .or(`recipient_id.eq.${profileId},author_id.eq.${profileId}`)
      .order("created_at", { ascending: false }),
    supabase
      .from("profile_recommendation_requests")
      .select("id, requester_id, recommender_id, recipient_position, message, created_at")
      .eq("status", "pending")
      .or(`requester_id.eq.${profileId},recommender_id.eq.${profileId}`)
      .order("created_at", { ascending: false }),
  ]);
  if (recRes.error) {
    // Table missing until the migration is applied — don't take the whole
    // profile page down with it.
    console.error("Couldn't load recommendations; apply the latest Supabase migration.", recRes.error.message);
    return { received: [], given: [], requests: [] };
  }
  const recs = recRes.data ?? [];
  const reqs = reqRes.error ? [] : reqRes.data ?? [];

  const ids = [
    ...new Set([
      ...recs.flatMap((r) => [r.author_id, r.recipient_id]),
      ...reqs.flatMap((r) => [r.requester_id, r.recommender_id]),
    ]),
  ];
  const { data: members } = ids.length
    ? await supabase.from("network_members").select("id, first_name, last_name, avatar_url, headline, job_title").in("id", ids)
    : { data: [] };
  const byId = new Map((members ?? []).filter((m) => m.id).map((m) => [m.id!, m]));
  const person = (id: string): RecommendationPerson => {
    const m = byId.get(id);
    return {
      id,
      name: m ? `${m.first_name ?? ""} ${m.last_name ?? ""}`.trim() || "A member" : "A member",
      avatarUrl: m?.avatar_url ?? null,
      headline: m?.headline || m?.job_title || null,
    };
  };

  const items: RecommendationItem[] = recs.map((r) => ({
    id: r.id,
    author: person(r.author_id),
    recipient: person(r.recipient_id),
    relationship: r.relationship as RecommendationRelationship,
    recipientPosition: r.recipient_position,
    body: r.body,
    status: r.status as RecommendationStatus,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  }));

  return {
    received: items.filter((r) => r.recipient.id === profileId),
    given: items.filter((r) => r.author.id === profileId),
    requests: reqs.map((r) => ({
      id: r.id,
      requester: person(r.requester_id),
      recommender: person(r.recommender_id),
      recipientPosition: r.recipient_position,
      message: r.message,
      createdAt: r.created_at,
    })),
  };
}

// ------------------------------------------------------- company analytics

// De-duplicated server-side (see record_company_view): a company's own
// admins never count, and a signed-in member counts once per 30 minutes.
export async function recordCompanyView(companyId: string): Promise<void> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("record_company_view", { target_company_id: companyId });
  if (error) console.error("recordCompanyView failed (non-fatal):", error.message);
}

export interface CompanyAnalytics {
  days: number;
  views: number;
  viewsPrev: number;
  uniqueViewers: number;
  guestViews: number;
  followers: number;
  newFollowers: number;
  newFollowersPrev: number;
  reviewCount: number;
  avgRating: number | null;
  newReviews: number;
  unansweredReviews: number;
  ratingBreakdown: Record<"1" | "2" | "3" | "4" | "5", number>;
  applications: number;
  applicationsPrev: number;
  opportunityResponses: number;
  opportunityResponsesPrev: number;
  postViews: number;
  postViewsPrev: number;
  daily: { day: string; views: number; follows: number }[];
}

// Admin-only rollup (the RPC raises for anyone who isn't one of the
// company's admins or a platform admin).
export async function getCompanyAnalytics(companyId: string, days = 30): Promise<CompanyAnalytics | null> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("company_analytics", { target_company_id: companyId, days });
  if (error) {
    console.error("getCompanyAnalytics failed:", error.message);
    return null;
  }
  const a = data as unknown as CompanyAnalytics;
  return { ...a, avgRating: a.avgRating == null ? null : Number(a.avgRating), daily: a.daily ?? [] };
}

export interface CompanyPartnerApplicationStatus {
  status: string;
  createdAt: string;
  infoRequest: string | null;
  applicantResponse: string | null;
  reviewNote: string | null;
  reviewedAt: string | null;
}

// Latest partner application for the company's own owner/admins (RLS
// scopes partner_inquiries to them), shown on the company profile so they
// can track it without reopening the Become a Partner modal.
export async function getCompanyPartnerApplication(companyId: string): Promise<CompanyPartnerApplicationStatus | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("partner_inquiries")
    .select("status, created_at, info_request, applicant_response, review_note, reviewed_at")
    .eq("company_id", companyId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) {
    console.error("getCompanyPartnerApplication failed:", error.message);
    return null;
  }
  if (!data) return null;
  return {
    status: data.status,
    createdAt: data.created_at,
    infoRequest: data.info_request,
    applicantResponse: data.applicant_response,
    reviewNote: data.review_note,
    reviewedAt: data.reviewed_at,
  };
}

export interface AdminCompanySummary {
  id: string;
  slug: string;
  name: string;
}

export async function getAdminCompanies(profileId: string): Promise<AdminCompanySummary[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.from("company_admins").select("companies(id, slug, name)").eq("profile_id", profileId);
  if (error) throw error;
  return (data ?? []).filter((r) => r.companies).map((r) => ({ id: r.companies!.id, slug: r.companies!.slug, name: r.companies!.name }));
}

export interface JobCategoryOption {
  id: string;
  title: string;
}

// Plain id/title list for the job-posting form's Role Category select — no
// jobs(count) join, so it's cheap enough to load on JobsHeader's fast path
// alongside getAdminCompanies rather than waiting on the slow jobs list.
export async function getJobCategoryOptions(): Promise<JobCategoryOption[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.from("job_categories").select("id, title").order("sort_order");
  if (error) throw error;
  return data ?? [];
}

// Real per-category job counts via a live join count — job_categories
// used to carry a hardcoded job_count (42/37/61) with no relation to the
// actual jobs table; jobs.category_id (20260918030000_job_category_real_counts.sql)
// replaces it so this always reflects real open roles. The embedded count
// is scoped to the same PUBLISHED_FILTER every public job list uses (a
// draft/archived job shouldn't inflate "Popular GovCon Roles"), and a
// category with zero live jobs is dropped rather than shown as "Popular"
// with a 0 next to it.
export async function getJobCategories(): Promise<JobCategory[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("job_categories")
    .select("*, jobs(count)")
    .or(PUBLISHED_FILTER(), { foreignTable: "jobs" })
    .is("jobs.closed_at", null)
    .order("sort_order");
  if (error) throw error;

  return (data ?? [])
    .map((c) => ({
      id: c.id,
      count: (c.jobs as unknown as { count: number }[])[0]?.count ?? 0,
      title: c.title,
      description: c.description,
    }))
    .filter((c) => c.count > 0);
}

// Every live resource, Pro ones included (free members see them locked).
// Only member-safe columns are selectable (20261002000000_resource_access_levels.sql);
// resource_library() adds the viewer's access state plus the extras shown
// only to viewers who can open each one.
export async function getResources(): Promise<Resource[]> {
  const supabase = await createClient();
  const [{ data, error }, { data: library, error: libraryError }] = await Promise.all([
    supabase
      .from("resources")
      .select(
        "id, slug, title, type, description, access, is_pro, kind, file_ext, file_size, file_uploaded_at, scan_status, video_provider, video_duration_seconds, sort_order",
      )
      .or(PUBLISHED_FILTER())
      .order("sort_order"),
    supabase.rpc("resource_library"),
  ]);
  if (error) throw error;
  if (libraryError) throw libraryError;
  const extras = new Map((library ?? []).map((l) => [l.id, l]));

  return (
    (data ?? [])
      // A file resource is only listed once its file is uploaded and has
      // passed (or, with no scanner configured, skipped) the virus scan.
      .filter((r) => r.kind !== "file" || (r.file_ext && (r.scan_status === "clean" || r.scan_status === "unscanned")))
      .map((r) => {
        const extra = extras.get(r.id);
        const state = extra?.access_state ?? (r.access === "public" ? "open" : "signin");
        return {
          id: r.id,
          route: `resources/${r.slug}`,
          title: r.title,
          type: r.type,
          kind: r.kind as Resource["kind"],
          description: r.description,
          access: r.access as Resource["access"],
          isPro: r.access === "pro",
          locked: state === "open" ? null : (state as "signin" | "upgrade"),
          linkDomain: r.kind === "link" ? (extra?.link_domain ?? null) : null,
          fileExt: r.kind === "file" ? r.file_ext : null,
          fileSize: r.kind === "file" ? r.file_size : null,
          fileUpdatedAt: r.kind === "file" ? r.file_uploaded_at : null,
          videoProvider: r.kind === "video" ? (r.video_provider as Resource["videoProvider"]) : null,
          videoThumbnailUrl: r.kind === "video" ? (extra?.video_thumbnail_url ?? null) : null,
          videoDurationSeconds: r.kind === "video" ? r.video_duration_seconds : null,
        };
      })
  );
}

// Real "Top Members"/"Top Contributors" ranking — replaces the retired
// seeded `members` table. Score is a real, simple composite (post count +
// total votes received) computed from actual posts/post_votes, never a
// stored fake cred number. Pass a communityId to scope the ranking to one
// community's contributors, "communities" for every community post (the
// Community section's own ranking — Home feed posts never count toward it),
// or null for the platform-wide ranking.
export async function getTopContributors(communityId: string | "communities" | null, limit = 5): Promise<Member[]> {
  const supabase = await createClient();
  let query = supabase.from("posts").select("author_profile_id, votes").or(PUBLISHED_FILTER());
  if (communityId === "communities") query = query.not("community_id", "is", null);
  else if (communityId) query = query.eq("community_id", communityId);
  const { data: posts, error } = await query;
  if (error) throw error;

  const scoreByAuthor = new Map<string, number>();
  for (const p of posts ?? []) {
    scoreByAuthor.set(p.author_profile_id, (scoreByAuthor.get(p.author_profile_id) ?? 0) + 1 + p.votes);
  }

  const ranked = [...scoreByAuthor.entries()].sort((a, b) => b[1] - a[1]).slice(0, limit);
  if (ranked.length === 0) return [];

  // `network_members` (not `profiles` directly) — profiles' RLS only allows
  // a self/admin read, which would silently drop every contributor who
  // isn't the viewer themselves.
  const { data: profiles, error: profilesError } = await supabase
    .from("network_members")
    .select("id, first_name, last_name, avatar_url, headline, job_title, plan_selection")
    .in("id", ranked.map(([id]) => id));
  if (profilesError) throw profilesError;
  const byId = new Map(profiles?.filter((p) => p.id).map((p) => [p.id as string, p]));

  return ranked
    .map(([id, score]) => {
      const profile = byId.get(id);
      if (!profile) return null;
      return {
        id: profile.id,
        name: `${profile.first_name ?? ""} ${profile.last_name ?? ""}`.trim() || "GovConUnited Member",
        role: profile.headline || profile.job_title || "GovConUnited Member",
        avatar: profile.avatar_url,
        cred: score,
        // No "verified" concept exists for real accounts yet — always false
        // rather than a fabricated badge.
        verified: false,
        isPro: profile.plan_selection === "pro",
      };
    })
    .filter((m): m is Member => m !== null);
}

// Real signed-up accounts, via the `network_members` view (public.profiles
// with only safe columns exposed — see 20260917010000_network_members_view.sql
// for why this needs a view rather than querying `profiles` directly).
export async function getNetworkMembers({ includeCareers = false }: { includeCareers?: boolean } = {}): Promise<NetworkMember[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("network_members")
    .select("*")
    .order("created_at");
  if (error) throw error;

  return (data ?? [])
    .filter((m): m is typeof m & { id: string } => !!m.id)
    .map((m) => {
      const firstName = m.first_name?.trim() || "";
      const lastName = m.last_name?.trim() || "";
      const name = `${firstName} ${lastName}`.trim() || "GovConUnited Member";
      const initials = (firstName[0] ?? "") + (lastName[0] ?? "") || "GC";
      return {
        id: m.id,
        name,
        initials: initials.toUpperCase(),
        avatarUrl: m.avatar_url,
        isPro: m.plan_selection === "pro",
        headline: m.headline,
        jobTitle: m.job_title,
        companyName: m.company_name,
        openTo: includeCareers ? normalizeOpenTo(m.open_to) : publicOpenTo(normalizeOpenTo(m.open_to)),
      };
    });
}

// Backs the @mention autocomplete in post/comment composers — any real
// member (not just connections, matching LinkedIn's own @mention scope),
// searched server-side rather than filtering a fully-fetched list
// client-side, since network_members can be far larger than a single
// viewer's connections (see getNetworkMembers above, used where the
// full-list-then-filter pattern is fine).
export async function searchMentionableMembers(userId: string, query: string, limit = 8): Promise<NetworkMember[]> {
  const q = query.trim();
  if (!q) return [];
  const supabase = await createClient();
  const like = `%${q}%`;
  const { data, error } = await supabase
    .from("network_members")
    .select("id, first_name, last_name, avatar_url, headline, job_title, plan_selection")
    .neq("id", userId)
    .or(`first_name.ilike.${like},last_name.ilike.${like}`)
    .limit(limit);
  if (error) throw error;

  return (data ?? [])
    .filter((m): m is typeof m & { id: string } => !!m.id)
    .map((m) => {
      const name = `${m.first_name ?? ""} ${m.last_name ?? ""}`.trim() || "GovConUnited Member";
      return {
        id: m.id,
        name,
        initials: initialsFromName(name),
        avatarUrl: m.avatar_url,
        isPro: m.plan_selection === "pro",
        headline: m.headline,
        jobTitle: m.job_title,
      };
    });
}

type WorkExperienceRow = Tables<"work_experiences">;
type EducationRecordRow = Tables<"education_records">;

export async function getWorkExperiences(profileId: string): Promise<WorkExperience[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("work_experiences")
    .select("*, companies(slug, logo_url)")
    .eq("profile_id", profileId)
    .order("sort_order", { ascending: true })
    .order("created_at", { ascending: false });
  if (error) throw error;

  return ((data ?? []) as (WorkExperienceRow & { companies: { slug: string; logo_url: string | null } | null })[]).map((e) => ({
    id: e.id,
    title: e.title,
    company: e.company,
    companyId: e.company_id,
    companySlug: e.companies?.slug ?? null,
    companyLogoUrl: e.companies?.logo_url ?? null,
    employmentType: e.employment_type,
    isCurrent: e.is_current,
    startLabel: e.start_label,
    endLabel: e.end_label,
    location: e.location,
    description: e.description,
    skills: e.skills ?? [],
  }));
}

export async function getEducationRecords(profileId: string): Promise<EducationRecord[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("education_records")
    .select("*")
    .eq("profile_id", profileId)
    .order("sort_order", { ascending: true })
    .order("created_at", { ascending: false });
  if (error) throw error;

  return ((data ?? []) as EducationRecordRow[]).map((e) => ({
    id: e.id,
    school: e.school,
    degree: e.degree,
    field: e.field,
    startLabel: e.start_label,
    endLabel: e.end_label,
    grade: e.grade,
    description: e.description,
    skills: e.skills ?? [],
    activities: e.activities,
  }));
}

// Real "search appearances" — every time /api/search returns this profile
// as a result, replacing what the mockup shows as a fabricated number.
export async function recordSearchImpression(profileId: string): Promise<void> {
  const supabase = await createClient();
  await supabase.from("profile_search_impressions").insert({ profile_id: profileId });
}

export async function getSearchAppearanceCount(profileId: string): Promise<number> {
  const supabase = await createClient();
  const { count, error } = await supabase
    .from("profile_search_impressions")
    .select("id", { count: "exact", head: true })
    .eq("profile_id", profileId);
  if (error) throw error;
  return count ?? 0;
}

// A real public connection count — see connection_counts view
// (20260918000900_connection_counts_view.sql) for why this can't just be
// getConnectionIds(id).size for someone else's profile (that table's RLS
// only returns rows where the *querying* user is a participant).
export async function getConnectionCount(profileId: string): Promise<number> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("connection_counts")
    .select("connection_count")
    .eq("profile_id", profileId)
    .maybeSingle();
  if (error) throw error;
  return data?.connection_count ?? 0;
}

export async function getProfileFollowerCount(profileId: string): Promise<number> {
  const supabase = await createClient();
  const { count, error } = await supabase
    .from("profile_follows")
    .select("id", { count: "exact", head: true })
    .eq("followed_id", profileId);
  if (error) throw error;
  return count ?? 0;
}

// LinkedIn-style "People also viewed": profiles that this profile's
// visitors also looked at, from live profile_views (people_also_viewed RPC
// — it returns ranked ids only, never who viewed whom). The viewer is
// never listed; members not in the public directory drop out.
export async function getPeopleAlsoViewed(
  profileId: string,
  viewerId: string | null,
  limit = 3,
  members?: NetworkMember[],
): Promise<NetworkMember[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("people_also_viewed", {
    target_profile: profileId,
    exclude_profile: viewerId ?? undefined,
    max_results: 12,
  });
  if (error) throw error;
  if (!data?.length) return [];

  const byId = new Map((members ?? (await getNetworkMembers())).map((mem) => [mem.id, mem]));
  return data
    .map((row) => byId.get(row.profile_id))
    .filter((mem): mem is NetworkMember => Boolean(mem) && mem!.id !== viewerId && mem!.id !== profileId)
    .slice(0, limit);
}

// A real completeness percentage — no invented "95% complete" banner.
// Checks the same real fields the profile page actually renders. Returns
// the itemized checklist too (not just the aggregate number) so the UI can
// show a real "here's what's missing" roadmap instead of a bare percentage.
function computeProfileCompleteness(
  m: {
    avatar_url: string | null;
    cover_image_url: string | null;
    headline: string | null;
    job_title: string | null;
    bio: string | null;
    location: string | null;
    company_name: string | null;
    skills: string[] | null;
    certifications: string[] | null;
    phone: string | null;
    website: string | null;
    linkedin_url: string | null;
  },
  hasExperience: boolean,
  hasEducation: boolean,
): { pct: number; items: { label: string; done: boolean }[] } {
  const items = [
    { label: "Profile photo", done: Boolean(m.avatar_url) },
    { label: "Banner image", done: Boolean(m.cover_image_url) },
    { label: "Headline or job title", done: Boolean(m.headline || m.job_title) },
    { label: "Bio", done: Boolean(m.bio) },
    { label: "Location", done: Boolean(m.location) },
    { label: "Company", done: Boolean(m.company_name) },
    { label: "Skills", done: (m.skills?.length ?? 0) > 0 },
    { label: "Certifications", done: (m.certifications?.length ?? 0) > 0 },
    { label: "Contact info (phone, website, or LinkedIn)", done: Boolean(m.phone || m.website || m.linkedin_url) },
    { label: "Work experience", done: hasExperience },
    { label: "Education", done: hasEducation },
  ];
  const pct = Math.round((items.filter((i) => i.done).length / items.length) * 100);
  return { pct, items };
}

// Full public profile for a single member's /network/[id] page — every
// extended real field (job title, headline, bio, skills, experience,
// education, and every real stat shown on the page) that the deliberately
// thin NetworkMember type used by lists/teasers doesn't carry.
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// `idOrSlug` is whatever the /network/[id] route segment holds — either the
// profile's real id (every existing internal link) or its human-readable
// slug (the "Public profile & URL" panel's nicer, shareable address). Both
// resolve to the same profile; nothing had to change at the many existing
// callsites that still link by id.
export async function getPublicProfile(idOrSlug: string, viewerId: string | null = null): Promise<PublicProfile | null> {
  const supabase = await createClient();
  // Slugs are stored lowercase; hand-typed or shared links may not be.
  const lookup = UUID_RE.test(idOrSlug)
    ? { column: "id", value: idOrSlug }
    : { column: "slug", value: idOrSlug.trim().toLowerCase() };
  const { data: m, error } = await supabase.from("network_members").select("*").eq(lookup.column, lookup.value).maybeSingle();
  if (error) throw error;
  if (!m?.id) return null;
  const id = m.id;

  const isOwnProfile = viewerId === id;

  async function getBlockPair(): Promise<{ blocker_id: string; blocked_id: string }[]> {
    if (!viewerId || isOwnProfile) return [];
    const { data } = await supabase
      .from("profile_blocks")
      .select("blocker_id, blocked_id")
      .or(`blocker_id.eq.${viewerId},blocker_id.eq.${id}`);
    return data ?? [];
  }

  const [
    workExperiences,
    educationRecords,
    connectionCount,
    followerCount,
    profileViewCount,
    searchAppearanceCount,
    postImpressionCount,
    communityPostImpressionCount,
    profilePosts,
    mutualConnectionCount,
    personSaveIds,
    blocks,
    comments,
    canSeeCareerOpenTo,
  ] = await Promise.all([
    getWorkExperiences(id),
    getEducationRecords(id),
    getConnectionCount(id),
    getProfileFollowerCount(id),
    getProfileViewCount(id),
    getSearchAppearanceCount(id),
    getPostImpressionCount(id, "feed"),
    getPostImpressionCount(id, "community"),
    getProfilePosts(id, viewerId),
    viewerId && !isOwnProfile ? getMutualConnectionCount(viewerId, id) : Promise.resolve(0),
    viewerId ? getPersonSaveIds(viewerId) : Promise.resolve(new Set<string>()),
    getBlockPair(),
    getProfileComments(id, 50),
    isOwnProfile ? Promise.resolve(true) : isVerifiedCompanyAccount(viewerId),
  ]);

  const isBlockedByViewer = !!viewerId && blocks.some((b) => b.blocker_id === viewerId && b.blocked_id === id);
  const hasBlockedViewer = !!viewerId && blocks.some((b) => b.blocker_id === id && b.blocked_id === viewerId);

  const firstName = m.first_name?.trim() || "";
  const lastName = m.last_name?.trim() || "";
  const name = `${firstName} ${lastName}`.trim() || "GovConUnited Member";
  const profileCompleteness = computeProfileCompleteness(m, workExperiences.length > 0, educationRecords.length > 0);
  const initials = ((firstName[0] ?? "") + (lastName[0] ?? "") || "GC").toUpperCase();
  // "Show my connection count and list to other members" covers followers
  // too: when it's off, only the member themself gets the real numbers.
  const connectionsVisible = m.connections_visible ?? true;
  const networkVisible = isOwnProfile || connectionsVisible;

  return {
    id: m.id,
    slug: m.slug ?? m.id,
    name,
    initials,
    avatarUrl: m.avatar_url,
    isPro: m.plan_selection === "pro",
    jobTitle: m.job_title,
    location: m.location,
    companyName: m.company_name,
    coverImageUrl: m.cover_image_url,
    pronouns: m.pronouns,
    headline: m.headline,
    bio: m.bio,
    specialty: m.specialty,
    experienceLevel: m.experience_level,
    clearance: m.clearance,
    clearanceVerified: m.clearance_verified === true,
    availability: m.availability,
    relationshipGoals: m.relationship_goals,
    skills: m.skills ?? [],
    certifications: m.certifications ?? [],
    phone: m.phone,
    website: m.website,
    linkedinUrl: m.linkedin_url,
    languages: m.languages,
    twitterUrl: m.twitter_url ?? null,
    services: m.services ?? [],
    industries: m.industries ?? [],
    govconInterests: m.govcon_interests ?? [],
    naicsInterests: m.naics_interests ?? [],
    capabilityStatementUrl: m.capability_statement_url ?? null,
    capabilityStatementName: m.capability_statement_name ?? null,
    // Careers choices are only for the member and verified company accounts.
    openTo: canSeeCareerOpenTo ? normalizeOpenTo(m.open_to) : publicOpenTo(normalizeOpenTo(m.open_to)),
    connectionsVisible,
    connectionCount: networkVisible ? connectionCount : 0,
    followerCount: networkVisible ? followerCount : 0,
    profileViewCount,
    postImpressionCount,
    communityPostImpressionCount,
    searchAppearanceCount,
    completenessPct: profileCompleteness.pct,
    completenessItems: profileCompleteness.items,
    mutualConnectionCount,
    isSavedByViewer: personSaveIds.has(id),
    isBlockedByViewer,
    hasBlockedViewer,
    workExperiences,
    educationRecords,
    feedPosts: profilePosts.filter((p) => p.communityId == null),
    feedComments: comments.filter((c) => c.communityId == null),
    communityPosts: profilePosts.filter((p) => p.communityId != null),
    communityComments: comments.filter((c) => c.communityId != null),
  };
}

function formatEventTimeRange(startsAt: string, endsAt: string | null, timezoneLabel: string): string {
  const start = new Date(startsAt);
  const startPart = start.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", timeZone: EVENT_TIME_ZONE });
  if (!endsAt) return `${startPart} ${timezoneLabel}`;
  const endPart = new Date(endsAt).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", timeZone: EVENT_TIME_ZONE });
  return `${startPart} – ${endPart} ${timezoneLabel}`;
}

export async function getEvents(includePast = false): Promise<EventItem[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("events")
    .select("*")
    .or(PUBLISHED_FILTER())
    .order("starts_at", { ascending: !includePast });
  if (error) throw error;

  const rows = (data ?? []).filter((e) => (includePast ? hasEventEnded(e.starts_at, e.ends_at) : !hasEventEnded(e.starts_at, e.ends_at)));

  const eventIds = rows.map((e) => e.id);
  const counts = new Map<string, number>();
  if (eventIds.length > 0) {
    // A plain select here would run through the caller's own RLS —
    // "Members manage their own event registrations" only lets a user see
    // THEIR OWN row, so a direct query would silently undercount every
    // event to 0 or 1 for anyone who isn't that one registrant. The
    // aggregate count itself isn't private (who registered is, and that's
    // still gated behind get_event_attendees), so it's read through a
    // security-definer RPC instead.
    const { data: registrations } = await supabase.rpc("get_event_attendee_counts", { p_event_ids: eventIds });
    for (const r of registrations ?? []) counts.set(r.event_id, r.approved_count);
  }

  const creatorIds = Array.from(new Set(rows.map((e) => e.created_by).filter((id): id is string => !!id)));
  const creators = new Map<string, { name: string; avatarUrl: string | null }>();
  if (creatorIds.length > 0) {
    // profiles' own RLS only lets a member read their own row, so a plain
    // profiles query here would silently come back empty for every event
    // whose creator isn't the current viewer (same trap as the attending
    // count above) — network_members is the established public-safe view
    // for exactly this (see namesByProfileId).
    const { data: creatorProfiles } = await supabase
      .from("network_members")
      .select("id, first_name, last_name, avatar_url")
      .in("id", creatorIds);
    for (const p of creatorProfiles ?? []) {
      if (!p.id) continue;
      creators.set(p.id, { name: `${p.first_name ?? ""} ${p.last_name ?? ""}`.trim() || "GovConUnited Member", avatarUrl: p.avatar_url });
    }
  }

  return rows.map((e) => {
    const date = new Date(e.starts_at);
    return {
      id: e.slug,
      dbId: e.id,
      month: date.toLocaleDateString("en-US", { month: "short", timeZone: EVENT_TIME_ZONE }).toUpperCase(),
      day: date.toLocaleDateString("en-US", { day: "2-digit", timeZone: EVENT_TIME_ZONE }),
      kind: eventKindLabel[e.format] ?? e.format.toUpperCase(),
      title: e.title,
      when: formatEventWhen(e.starts_at, e.timezone_label, e.location),
      description: e.description,
      cta: e.cta_label,
      date: date.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric", timeZone: EVENT_TIME_ZONE }),
      time: formatEventTimeRange(e.starts_at, e.ends_at, e.timezone_label),
      location: e.location || "Online",
      endsAt: e.ends_at,
      imageUrl: e.image_url,
      attendingCount: counts.get(e.id) ?? 0,
      agenda: Array.isArray(e.agenda) ? (e.agenda as unknown as EventAgendaItem[]) : [],
      speakers: Array.isArray(e.speakers) ? (e.speakers as unknown as EventSpeaker[]) : [],
      createdBy: e.created_by,
      creatorName: e.created_by ? (creators.get(e.created_by)?.name ?? null) : null,
      creatorAvatarUrl: e.created_by ? (creators.get(e.created_by)?.avatarUrl ?? null) : null,
    };
  });
}

export interface UpcomingEventEntry {
  id: string;
  title: string;
  month: string;
  day: string;
  kind: string;
  location: string | null;
  startsAt: string;
  href: string;
}

// The dashboard's "Upcoming Events" widget used to only read the
// admin-managed `events` table, which stays empty until an admin publishes
// one — so it showed "No upcoming events" even when real members had
// created event-type posts via the composer (the only way events actually
// get created today). This merges both real sources — admin events (linking
// to their own /events/[id] detail page) and future event posts (linking to
// the general /events section, matching that click behavior everywhere
// else) — sorted together by date. RLS on `posts` already scopes event
// posts to what the viewer can see, so no extra visibility filtering here.
export async function getUpcomingEvents(limit = 3): Promise<UpcomingEventEntry[]> {
  const supabase = await createClient();
  // A generous SQL-level floor (90 days back) — the precise cutoff (an
  // explicit end time, or start+24h when there isn't one) is judged in JS
  // via hasEventEnded, since an event that started a day or two ago can
  // still be within its grace window, or have an explicit end far in the
  // future. No result-count limit at the SQL level either: these tables are
  // small, and ordering by start date ascending then truncating at the DB
  // layer would silently drop genuinely-upcoming rows whenever there are
  // more already-ended rows within the floor window than the page size.
  const floorIso = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString();

  const [adminRes, postRes] = await Promise.all([
    supabase
      .from("events")
      .select("slug, title, starts_at, ends_at, location, format")
      .or(PUBLISHED_FILTER())
      .gte("starts_at", floorIso)
      .order("starts_at"),
    supabase
      .from("posts")
      .select("id, title, event_starts_at, event_ends_at, event_location")
      .eq("post_type", "event")
      .or(PUBLISHED_FILTER())
      .not("event_starts_at", "is", null)
      .gte("event_starts_at", floorIso)
      .order("event_starts_at"),
  ]);
  if (adminRes.error) throw adminRes.error;
  if (postRes.error) throw postRes.error;

  const fromAdmin: UpcomingEventEntry[] = (adminRes.data ?? [])
    .filter((e) => !hasEventEnded(e.starts_at, e.ends_at))
    .map((e) => {
    const date = new Date(e.starts_at);
    return {
      id: `event-${e.slug}`,
      title: e.title,
      month: date.toLocaleDateString("en-US", { month: "short", timeZone: EVENT_TIME_ZONE }).toUpperCase(),
      day: date.toLocaleDateString("en-US", { day: "2-digit", timeZone: EVENT_TIME_ZONE }),
      kind: eventKindLabel[e.format] ?? e.format.toUpperCase(),
      location: e.location,
      startsAt: e.starts_at,
      href: `/events/${e.slug}`,
    };
  });

  const fromPosts: UpcomingEventEntry[] = (postRes.data ?? [])
    .filter((p) => !hasEventEnded(p.event_starts_at as string, p.event_ends_at))
    .map((p) => {
    const date = new Date(p.event_starts_at as string);
    return {
      id: `post-${p.id}`,
      title: p.title,
      month: date.toLocaleDateString("en-US", { month: "short" }).toUpperCase(),
      day: date.toLocaleDateString("en-US", { day: "2-digit" }),
      kind: "Community Event",
      location: p.event_location,
      startsAt: p.event_starts_at as string,
      href: "/events",
    };
  });

  return [...fromAdmin, ...fromPosts]
    .sort((a, b) => new Date(a.startsAt).getTime() - new Date(b.startsAt).getTime())
    .slice(0, limit);
}

const POST_SELECT =
  "*, post_media(kind,storage_path,sort_order), poll_options(id,label,sort_order,poll_votes(profile_id))";

const MEDIA_BUCKET: Record<"image" | "video", string> = { image: "post-images", video: "post-videos" };

interface AuthorInfo {
  name: string;
  avatarUrl: string | null;
  headline: string | null;
  jobTitle: string | null;
  companyName: string | null;
  isPro: boolean;
}

// `profiles` RLS only allows a member to read their OWN row (or an admin to
// read any row) — a direct `author_profile:author_profile_id(...)` FK embed
// against `profiles` silently returns null for every post authored by
// someone other than the viewer, which is why posts used to show the
// generic "GovConUnited Member" fallback for anyone but yourself. The real
// fix is the same one every other cross-member lookup in this codebase
// already uses: `network_members`, a security-definer view exposing only
// safe public columns, with no RLS restriction to "self only."
async function getAuthorMap(
  supabase: Awaited<ReturnType<typeof createClient>>,
  authorIds: string[],
): Promise<Map<string, AuthorInfo>> {
  const uniqueIds = [...new Set(authorIds)];
  if (uniqueIds.length === 0) return new Map();
  const { data, error } = await supabase
    .from("network_members")
    .select("id, first_name, last_name, avatar_url, headline, job_title, company_name, plan_selection")
    .in("id", uniqueIds);
  if (error) throw error;
  return new Map(
    (data ?? [])
      .filter((m): m is typeof m & { id: string } => !!m.id)
      .map((m) => [
        m.id,
        {
          name: `${m.first_name ?? ""} ${m.last_name ?? ""}`.trim(),
          avatarUrl: m.avatar_url,
          headline: m.headline,
          jobTitle: m.job_title,
          companyName: m.company_name,
          isPro: m.plan_selection === "pro",
        },
      ]),
  );
}

interface PostSocialContext {
  connectionIds: Set<string>;
  followIds: Set<string>;
  reactions: Map<string, string>;
  repostedOriginalIds: Set<string>;
  rsvps: Map<string, string>;
  savedIds: Set<string>;
}

// The viewer's own reaction per post, so the feed can show which of the 5
// reaction types they already picked instead of just a boolean voted flag.
async function getMyReactionMap(
  supabase: Awaited<ReturnType<typeof createClient>>,
  viewerId: string | null,
): Promise<Map<string, string>> {
  if (!viewerId) return new Map();
  const { data, error } = await supabase.from("post_votes").select("post_id, reaction_type").eq("user_id", viewerId);
  if (error) throw error;
  return new Map((data ?? []).map((v) => [v.post_id, v.reaction_type]));
}

// The viewer's own RSVP (interested/going) per event post — same shape as
// getMyReactionMap.
async function getMyRsvpMap(
  supabase: Awaited<ReturnType<typeof createClient>>,
  viewerId: string | null,
): Promise<Map<string, string>> {
  if (!viewerId) return new Map();
  const { data, error } = await supabase.from("event_post_rsvps").select("post_id, status").eq("profile_id", viewerId);
  if (error) throw error;
  return new Map((data ?? []).map((r) => [r.post_id, r.status]));
}

// The set of original-post ids the viewer already has an active repost of
// (repost_of_post_id is always the deepest original — repostAction never
// creates a repost-of-a-repost), driving the Repost/Reposted toggle state.
async function getRepostedOriginalIds(
  supabase: Awaited<ReturnType<typeof createClient>>,
  viewerId: string | null,
): Promise<Set<string>> {
  if (!viewerId) return new Set();
  const { data, error } = await supabase
    .from("posts")
    .select("repost_of_post_id")
    .eq("author_profile_id", viewerId)
    .not("repost_of_post_id", "is", null);
  if (error) throw error;
  return new Set((data ?? []).map((r) => r.repost_of_post_id as string));
}

// Batch-resolves the embedded "original post" for every repost row in a
// page of results, one extra query total (not N+1). Originals can need
// authors not already in `authorMap` (the reposter and the original author
// are usually different people), so this tops that map up in place.
async function attachRepostOriginals(
  supabase: Awaited<ReturnType<typeof createClient>>,
  rows: PostRow[],
  viewerId: string | null,
  authorMap: Map<string, AuthorInfo>,
  social: PostSocialContext,
): Promise<Map<string, Post>> {
  const originalIds = [...new Set(rows.map((r) => r.repost_of_post_id).filter((id): id is string => !!id))];
  if (originalIds.length === 0) return new Map();

  const { data, error } = await supabase.from("posts").select(POST_SELECT).in("id", originalIds);
  if (error) throw error;
  const originalRows = (data ?? []) as PostRow[];

  const missingAuthorIds = originalRows
    .map((r) => r.author_profile_id)
    .filter((id): id is string => !!id && !authorMap.has(id));
  if (missingAuthorIds.length > 0) {
    const extra = await getAuthorMap(supabase, missingAuthorIds);
    extra.forEach((info, id) => authorMap.set(id, info));
  }

  const originalsMap = new Map<string, Post>();
  originalRows.forEach((r) => originalsMap.set(r.id, mapPostRow(r, viewerId, authorMap, social)));
  return originalsMap;
}

function mapPostRow(
  p: PostRow,
  viewerId: string | null,
  authorMap: Map<string, AuthorInfo>,
  social: PostSocialContext = {
    connectionIds: new Set(),
    followIds: new Set(),
    reactions: new Map(),
    repostedOriginalIds: new Set(),
    rsvps: new Map(),
    savedIds: new Set(),
  },
  originalsMap: Map<string, Post> = new Map(),
): Post {
  const author = p.author_profile_id ? authorMap.get(p.author_profile_id) : undefined;
  const realName = author?.name ?? "";
  const media = (p.post_media ?? [])
    .slice()
    .sort((a, b) => a.sort_order - b.sort_order)
    .map((m) => ({
      kind: m.kind as "image" | "video",
      url: `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/${MEDIA_BUCKET[m.kind as "image" | "video"]}/${m.storage_path}`,
    }));
  const pollOptions = (p.poll_options ?? [])
    .slice()
    .sort((a, b) => a.sort_order - b.sort_order)
    .map((o) => ({
      id: o.id,
      label: o.label,
      voteCount: o.poll_votes?.length ?? 0,
      myVote: viewerId ? (o.poll_votes ?? []).some((v) => v.profile_id === viewerId) : false,
    }));
  return {
    id: p.id,
    route: `community/discussion/${p.slug}`,
    author: realName || "GovConUnited Member",
    authorAvatarUrl: author?.avatarUrl ?? null,
    authorJobTitle: author?.jobTitle ?? null,
    authorHeadline: author?.headline ?? null,
    authorIsPro: author?.isPro ?? false,
    authorProfileId: p.author_profile_id,
    category: p.category,
    postedAgo: formatRelativeTime(p.posted_at),
    postedAt: p.posted_at,
    title: p.title,
    body: p.body,
    votes: p.votes,
    comments: p.comment_count,
    postType: p.post_type as Post["postType"],
    audience: p.audience as Post["audience"],
    communityId: p.community_id,
    linkUrl: p.link_url,
    coverImageUrl: p.cover_image_url,
    eventStartsAt: p.event_starts_at,
    eventEndsAt: p.event_ends_at,
    eventLocation: p.event_location,
    pollClosesAt: p.poll_closes_at,
    shareCount: p.share_count,
    editedAt: p.edited_at,
    pinnedAt: p.pinned_at,
    lockedAt: p.locked_at,
    hiddenAt: p.hidden_at,
    hiddenReason: p.hidden_reason,
    tags: p.tags ?? [],
    status: p.status as Post["status"],
    acceptedCommentId: p.accepted_comment_id,
    media,
    pollOptions,
    isOwnPost: !!viewerId && p.author_profile_id === viewerId,
    authorIsConnection: !!p.author_profile_id && social.connectionIds.has(p.author_profile_id),
    authorIsFollowing: !!p.author_profile_id && social.followIds.has(p.author_profile_id),
    myReaction: (social.reactions.get(p.id) as Post["myReaction"]) ?? null,
    repostOfPostId: p.repost_of_post_id,
    repostOf: p.repost_of_post_id ? (originalsMap.get(p.repost_of_post_id) ?? null) : null,
    // A repost card's own action bar always shows a neutral "Repost" state —
    // only the underlying original (wherever it appears on its own) shows
    // the highlighted "Reposted" state. Both resolve reposts to the same
    // canonical id, so without this a repost card would inherit the
    // original's "reposted" state and show green on both cards at once.
    myRepost: p.post_type === "repost" ? false : social.repostedOriginalIds.has(p.id),
    interestedCount: p.interested_count,
    goingCount: p.going_count,
    myRsvp: (social.rsvps.get(p.id) as Post["myRsvp"]) ?? null,
    isSaved: social.savedIds.has(p.id),
  };
}

export async function getPosts(viewerId: string | null = null): Promise<Post[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("posts")
    .select(POST_SELECT)
    .or(PUBLISHED_FILTER())
    .order("votes", { ascending: false });
  if (error) throw error;

  const rows = (data ?? []) as PostRow[];
  const [authorMap, connectionIds, followIds, reactions, repostedOriginalIds, rsvps, savedIds] = await Promise.all([
    getAuthorMap(supabase, rows.map((p) => p.author_profile_id).filter((id): id is string => !!id)),
    viewerId ? getConnectionIds(viewerId) : Promise.resolve(new Set<string>()),
    viewerId ? getProfileFollowIds(viewerId) : Promise.resolve(new Set<string>()),
    getMyReactionMap(supabase, viewerId),
    getRepostedOriginalIds(supabase, viewerId),
    getMyRsvpMap(supabase, viewerId),
    viewerId ? getDiscussionSaveIds(viewerId) : Promise.resolve(new Set<string>()),
  ]);
  const social = { connectionIds, followIds, reactions, repostedOriginalIds, rsvps, savedIds };
  const originalsMap = await attachRepostOriginals(supabase, rows, viewerId, authorMap, social);
  return rows.map((p) => mapPostRow(p, viewerId, authorMap, social, originalsMap));
}

// One member's own published posts, newest first, for their profile's
// Activity sections — a direct author-scoped query instead of filtering the
// whole platform's getPosts() result in JS. Each post carries its
// community's name/slug (null for a Home feed post) so the caller can split
// feed activity from community activity.
export async function getProfilePosts(
  profileId: string,
  viewerId: string | null,
): Promise<(Post & { communityName: string | null; communitySlug: string | null })[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("posts")
    .select(`${POST_SELECT}, communities(name, slug)`)
    .eq("author_profile_id", profileId)
    .or(PUBLISHED_FILTER())
    .order("posted_at", { ascending: false });
  if (error) throw error;

  const rows = (data ?? []) as (PostRow & { communities: { name: string; slug: string } | null })[];
  const authorMap = await getAuthorMap(supabase, [profileId]);
  const social = {
    connectionIds: new Set<string>(),
    followIds: new Set<string>(),
    reactions: new Map<string, string>(),
    repostedOriginalIds: new Set<string>(),
    rsvps: new Map<string, string>(),
    savedIds: new Set<string>(),
  };
  const originalsMap = await attachRepostOriginals(supabase, rows, viewerId, authorMap, social);
  return rows.map((p) => ({
    ...mapPostRow(p, viewerId, authorMap, social, originalsMap),
    communityName: p.communities?.name ?? null,
    communitySlug: p.communities?.slug ?? null,
  }));
}

// Member-created "Event" posts (from the composer), upcoming only — a
// separate, lighter-weight source of events from the admin-managed `events`
// table. The Events section shows both: admin events keep their existing
// registration flow, while these render as a "From the Community" list with
// real author attribution and the same Interested/Going RSVP used in the
// feed. RLS already scopes visibility per the post's audience.
export async function getCommunityEventPosts(viewerId: string | null = null, limit = 6): Promise<Post[]> {
  const supabase = await createClient();
  // See getUpcomingEvents' comment: a generous 90-day SQL floor, precise
  // cutoff and final slice both handled in JS so an ascending DB-level
  // limit can't silently drop genuinely-upcoming rows behind older ones.
  const floorIso = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString();
  const { data, error } = await supabase
    .from("posts")
    .select(POST_SELECT)
    .eq("post_type", "event")
    .or(PUBLISHED_FILTER())
    .not("event_starts_at", "is", null)
    .gte("event_starts_at", floorIso)
    .order("event_starts_at", { ascending: true });
  if (error) throw error;

  const rows = ((data ?? []) as PostRow[]).filter(
    (p) => !hasEventEnded(p.event_starts_at as string, p.event_ends_at as string | null),
  );
  const [authorMap, connectionIds, followIds, reactions, repostedOriginalIds, rsvps, savedIds] = await Promise.all([
    getAuthorMap(supabase, rows.map((p) => p.author_profile_id).filter((id): id is string => !!id)),
    viewerId ? getConnectionIds(viewerId) : Promise.resolve(new Set<string>()),
    viewerId ? getProfileFollowIds(viewerId) : Promise.resolve(new Set<string>()),
    getMyReactionMap(supabase, viewerId),
    getRepostedOriginalIds(supabase, viewerId),
    getMyRsvpMap(supabase, viewerId),
    viewerId ? getDiscussionSaveIds(viewerId) : Promise.resolve(new Set<string>()),
  ]);
  const social = { connectionIds, followIds, reactions, repostedOriginalIds, rsvps, savedIds };
  return rows.slice(0, limit).map((p) => mapPostRow(p, viewerId, authorMap, social));
}

export interface FeedCursor {
  sortKey: number | null;
  postedAt: string;
  id: string;
}

// Real personalized+ranked feed, replacing the old getPosts().slice(0,4)/
// .reverse() fixed list. Page 1 is boosted toward what the viewer actually
// follows (joined communities, accepted connections' posts, admin-featured,
// their own posts), backfilled with the platform's most relevant posts so a
// brand-new account never sees an empty feed. Every row is still 100% real
// — backfill only relaxes personalization, never fabricates content. Pages
// beyond the first page through the full RLS-visible set in the requested
// sort order (personalization only shapes what leads the feed, not every
// page — the same tradeoff most feed products make).
export async function getFeedPosts(
  viewerId: string,
  sort: "top" | "recent",
  cursor: FeedCursor | null,
  limit = 10,
): Promise<{ posts: Post[]; nextCursor: FeedCursor | null }> {
  const supabase = await createClient();

  function applyOrder(query: any) {
    return sort === "top"
      ? query.order("votes", { ascending: false }).order("posted_at", { ascending: false }).order("id", { ascending: false })
      : query.order("posted_at", { ascending: false }).order("id", { ascending: false });
  }

  function applyCursor(query: any) {
    if (!cursor) return query;
    if (sort === "top") {
      return query.or(
        `votes.lt.${cursor.sortKey},and(votes.eq.${cursor.sortKey},posted_at.lt.${cursor.postedAt}),and(votes.eq.${cursor.sortKey},posted_at.eq.${cursor.postedAt},id.lt.${cursor.id})`,
      );
    }
    return query.or(`posted_at.lt.${cursor.postedAt},and(posted_at.eq.${cursor.postedAt},id.lt.${cursor.id})`);
  }

  let rows: PostRow[] = [];
  // Needed on every page (not just for page-1 personalization) so every
  // post — however it was fetched — can carry accurate "already connected"/
  // "already following" state for its Connect/Follow buttons.
  const [connectionIds, followIds] = await Promise.all([getConnectionIds(viewerId), getProfileFollowIds(viewerId)]);

  // "Recent" is strictly chronological on every page. The personalized-
  // then-backfill page 1 below appends backfill AFTER the personalized
  // rows, so a 10-day-old connection post would sit above yesterday's post
  // from a non-connection — and any non-connection post newer than the
  // last personalized row would be skipped by page 2's cursor entirely.
  if (!cursor && sort === "top") {
    // Community discussions are excluded from the main feed entirely
    // (.is("community_id", null) on every branch below) — the Community
    // section is a separate space now, not something that also surfaces in
    // the platform-wide feed just because the viewer joined it.
    const orClauses = ["featured.eq.true", `author_profile_id.eq.${viewerId}`];
    if (connectionIds.size > 0) orClauses.push(`author_profile_id.in.(${[...connectionIds].join(",")})`);

    let personalizedQuery = supabase
      .from("posts")
      .select(POST_SELECT)
      .is("community_id", null)
      .or(PUBLISHED_FILTER())
      .or(orClauses.join(","));
    personalizedQuery = applyOrder(personalizedQuery).limit(limit);
    const { data: personalized, error: personalizedError } = await personalizedQuery;
    if (personalizedError) throw personalizedError;
    rows = (personalized ?? []) as PostRow[];

    if (rows.length < limit) {
      const excludeIds = rows.map((r) => r.id);
      let backfillQuery = supabase.from("posts").select(POST_SELECT).is("community_id", null).or(PUBLISHED_FILTER());
      if (excludeIds.length > 0) backfillQuery = backfillQuery.not("id", "in", `(${excludeIds.join(",")})`);
      backfillQuery = applyOrder(backfillQuery).limit(limit - rows.length);
      const { data: backfill, error: backfillError } = await backfillQuery;
      if (backfillError) throw backfillError;
      rows = [...rows, ...((backfill ?? []) as PostRow[])];
    }
  } else {
    let query = supabase.from("posts").select(POST_SELECT).is("community_id", null).or(PUBLISHED_FILTER());
    query = applyCursor(applyOrder(query)).limit(limit); // applyCursor is a no-op on page 1
    const { data, error } = await query;
    if (error) throw error;
    rows = (data ?? []) as PostRow[];
  }

  const last = rows.at(-1);
  const nextCursor: FeedCursor | null =
    rows.length === limit && last ? { sortKey: sort === "top" ? last.votes : null, postedAt: last.posted_at, id: last.id } : null;

  const [authorMap, reactions, repostedOriginalIds, rsvps, savedIds, commentsByPost] = await Promise.all([
    getAuthorMap(supabase, rows.map((r) => r.author_profile_id).filter((id): id is string => !!id)),
    getMyReactionMap(supabase, viewerId),
    getRepostedOriginalIds(supabase, viewerId),
    getMyRsvpMap(supabase, viewerId),
    getDiscussionSaveIds(viewerId),
    // Every post in this page gets its comments attached up front (see
    // Post.initialComments) — the feed no longer shows a "Loading
    // comments…" flash the first time a viewer expands a post.
    getCommentsForPosts(supabase, rows.map((r) => r.id), viewerId),
  ]);
  const social = { connectionIds, followIds, reactions, repostedOriginalIds, rsvps, savedIds };
  const originalsMap = await attachRepostOriginals(supabase, rows, viewerId, authorMap, social);
  return {
    posts: rows.map((r) => ({
      ...mapPostRow(r, viewerId, authorMap, social, originalsMap),
      initialComments: commentsByPost.get(r.id) ?? [],
    })),
    nextCursor,
  };
}

type CommentViewerState = {
  votes: Map<string, number>;
  savedIds: Set<string>;
  followedIds: Set<string>;
};

// The viewer's own vote/save/follow state for a page of comments — three
// queries total, shared by the discussion page and the feed.
async function getCommentViewerState(
  supabase: Awaited<ReturnType<typeof createClient>>,
  rows: Tables<"post_comments">[],
  viewerId: string | null,
): Promise<CommentViewerState> {
  const state: CommentViewerState = { votes: new Map(), savedIds: new Set(), followedIds: new Set() };
  if (!viewerId || rows.length === 0) return state;
  const ids = rows.map((c) => c.id);
  const [{ data: voteRows }, { data: saveRows }, { data: followRows }] = await Promise.all([
    supabase.from("comment_likes").select("comment_id, value").eq("profile_id", viewerId).in("comment_id", ids),
    supabase.from("comment_saves").select("comment_id").eq("profile_id", viewerId).in("comment_id", ids),
    supabase.from("comment_follows").select("comment_id").eq("profile_id", viewerId).in("comment_id", ids),
  ]);
  (voteRows ?? []).forEach((r) => state.votes.set(r.comment_id, r.value));
  (saveRows ?? []).forEach((r) => state.savedIds.add(r.comment_id));
  (followRows ?? []).forEach((r) => state.followedIds.add(r.comment_id));
  return state;
}

function mapCommentRow(
  c: Tables<"post_comments">,
  authorMap: Map<string, AuthorInfo>,
  viewerId: string | null,
  viewerState: CommentViewerState,
): PostComment {
  const author = authorMap.get(c.author_profile_id);
  const vote = viewerState.votes.get(c.id);
  return {
    id: c.id,
    postId: c.post_id,
    authorProfileId: c.author_profile_id,
    author: author?.name || "GovConUnited Member",
    authorAvatarUrl: author?.avatarUrl ?? null,
    authorIsPro: author?.isPro ?? false,
    authorHeadline: author?.headline ?? null,
    authorJobTitle: author?.jobTitle ?? null,
    parentCommentId: c.parent_comment_id,
    body: c.body,
    imageUrl: c.image_url,
    videoUrl: c.video_url,
    createdAt: c.created_at,
    editedAt: c.updated_at !== c.created_at ? c.updated_at : null,
    mine: c.author_profile_id === viewerId,
    likeCount: c.like_count,
    likedByViewer: vote === 1,
    myVote: vote === 1 ? "up" : vote === -1 ? "down" : null,
    savedByViewer: viewerState.savedIds.has(c.id),
    followedByViewer: viewerState.followedIds.has(c.id),
  };
}

// Real comments + one level of replies for a post's discussion-detail
// page. Flattening (which comments are top-level vs. replies) is left to
// the caller via parentCommentId, matching PostComment's own doc comment.
export async function getPostComments(postId: string, viewerId: string | null): Promise<PostComment[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("post_comments")
    .select("*")
    .eq("post_id", postId)
    .eq("status", "published")
    .order("created_at", { ascending: true });
  if (error) throw error;

  const rows = (data ?? []) as Tables<"post_comments">[];
  const authorMap = await getAuthorMap(supabase, rows.map((c) => c.author_profile_id));

  const viewerState = await getCommentViewerState(supabase, rows, viewerId);
  return rows.map((c) => mapCommentRow(c, authorMap, viewerId, viewerState));
}

// Powers the "Comments" tab on a member's public profile — previously a
// permanent "not available yet" placeholder left over from before comments
// existed at all. This member's own comments across every post, newest
// first, each carrying just enough about its parent post to show it in
// context and link back to it. A comment whose post was since deleted is
// silently skipped rather than shown with broken context.
export async function getProfileComments(profileId: string, limit = 20): Promise<ProfileComment[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("post_comments")
    .select("id, body, created_at, post_id")
    .eq("author_profile_id", profileId)
    .eq("status", "published")
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw error;
  const rows = data ?? [];
  if (rows.length === 0) return [];

  const postIds = Array.from(new Set(rows.map((r) => r.post_id)));
  const { data: postRows } = await supabase
    .from("posts")
    .select("id, slug, title, category, author_profile_id, community_id, communities(name)")
    .in("id", postIds);
  const postMap = new Map((postRows ?? []).map((p) => [p.id, p]));
  const authorMap = await getAuthorMap(
    supabase,
    (postRows ?? []).map((p) => p.author_profile_id).filter((id): id is string => !!id),
  );

  return rows
    .map((c): ProfileComment | null => {
      const post = postMap.get(c.post_id);
      if (!post) return null;
      const author = post.author_profile_id ? authorMap.get(post.author_profile_id) : undefined;
      return {
        id: c.id,
        body: c.body,
        postedAgo: formatRelativeTime(c.created_at),
        postId: post.id,
        postRoute: `community/discussion/${post.slug}`,
        postTitle: post.title,
        postCategory: post.category,
        postAuthor: author?.name || "GovConUnited Member",
        communityId: post.community_id,
        communityName: (post.communities as { name: string } | null)?.name ?? null,
      };
    })
    .filter((c): c is ProfileComment => c !== null);
}

// Batched sibling of getPostComments — one query for every post in a feed
// page instead of one query per post, so getFeedPosts can attach each
// post's comments up front (see Post.initialComments) without an N+1.
async function getCommentsForPosts(
  supabase: Awaited<ReturnType<typeof createClient>>,
  postIds: string[],
  viewerId: string | null,
): Promise<Map<string, PostComment[]>> {
  const byPost = new Map<string, PostComment[]>();
  if (postIds.length === 0) return byPost;

  const { data, error } = await supabase
    .from("post_comments")
    .select("*")
    .in("post_id", postIds)
    .eq("status", "published")
    .order("created_at", { ascending: true });
  if (error) throw error;

  const rows = (data ?? []) as Tables<"post_comments">[];
  const authorMap = await getAuthorMap(supabase, rows.map((c) => c.author_profile_id));

  const viewerState = await getCommentViewerState(supabase, rows, viewerId);

  for (const c of rows) {
    const comment = mapCommentRow(c, authorMap, viewerId, viewerState);
    const existing = byPost.get(c.post_id);
    if (existing) existing.push(comment);
    else byPost.set(c.post_id, [comment]);
  }
  return byPost;
}

export interface MemberListEntry {
  id: string;
  name: string;
  avatarUrl: string | null;
  jobTitle: string | null;
  isSelf: boolean;
  isConnection: boolean;
  isFollowing: boolean;
}

// Backs the feed's "who reacted" popover — one real row per (post, member)
// reaction, newest first. reactionType lets the UI show each person's
// actual emoji instead of a generic list.
export async function getPostReactors(
  postId: string,
  viewerId: string | null,
): Promise<(MemberListEntry & { reactionType: string })[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("post_votes")
    .select("user_id, reaction_type, created_at")
    .eq("post_id", postId)
    .order("created_at", { ascending: false });
  if (error) throw error;

  const rows = data ?? [];
  const ids = rows.map((r) => r.user_id);
  const [authorMap, connectionIds, followIds] = await Promise.all([
    getAuthorMap(supabase, ids),
    viewerId ? getConnectionIds(viewerId) : Promise.resolve(new Set<string>()),
    viewerId ? getProfileFollowIds(viewerId) : Promise.resolve(new Set<string>()),
  ]);

  return rows.map((r) => {
    const info = authorMap.get(r.user_id);
    return {
      id: r.user_id,
      name: info?.name || "GovConUnited Member",
      avatarUrl: info?.avatarUrl ?? null,
      jobTitle: info?.jobTitle ?? null,
      reactionType: r.reaction_type,
      isSelf: r.user_id === viewerId,
      isConnection: connectionIds.has(r.user_id),
      isFollowing: followIds.has(r.user_id),
    };
  });
}

// Backs the feed's "who reposted" popover — every real repost post row
// pointing at this canonical original, newest first. `comment` is that
// repost's own quote text (null for a plain, no-comment repost).
export async function getPostReposters(
  originalPostId: string,
  viewerId: string | null,
): Promise<(MemberListEntry & { comment: string | null; repostedAt: string })[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("posts")
    .select("author_profile_id, body, posted_at")
    .eq("repost_of_post_id", originalPostId)
    .or(PUBLISHED_FILTER())
    .order("posted_at", { ascending: false });
  if (error) throw error;

  const rows = (data ?? []).filter((r): r is typeof r & { author_profile_id: string } => !!r.author_profile_id);
  const ids = rows.map((r) => r.author_profile_id);
  const [authorMap, connectionIds, followIds] = await Promise.all([
    getAuthorMap(supabase, ids),
    viewerId ? getConnectionIds(viewerId) : Promise.resolve(new Set<string>()),
    viewerId ? getProfileFollowIds(viewerId) : Promise.resolve(new Set<string>()),
  ]);

  return rows.map((r) => {
    const info = authorMap.get(r.author_profile_id);
    return {
      id: r.author_profile_id,
      name: info?.name || "GovConUnited Member",
      avatarUrl: info?.avatarUrl ?? null,
      jobTitle: info?.jobTitle ?? null,
      comment: r.body || null,
      repostedAt: r.posted_at,
      isSelf: r.author_profile_id === viewerId,
      isConnection: connectionIds.has(r.author_profile_id),
      isFollowing: followIds.has(r.author_profile_id),
    };
  });
}

// Real, joinable communities — replaces the old single flat "Community"
// board's free-text category label. Featured (admin-pinned) communities
// sort first, then by real member_count.
// communities.post_count is a stored counter with no trigger keeping it in
// sync (unlike member_count, which sync_community_member_count() maintains
// on every community_members insert/delete — see 20260920000000_communities.sql)
// — it's stuck at its default of 0 forever. Computed live here instead of
// trusting that column, across every community in one batched query rather
// than fixing it with a per-community round trip.
export async function getCommunityPostCounts(
  supabase: Awaited<ReturnType<typeof createClient>>,
  communityIds: string[],
): Promise<Map<string, number>> {
  const counts = new Map<string, number>();
  if (communityIds.length === 0) return counts;
  const { data, error } = await supabase
    .from("posts")
    .select("community_id")
    .in("community_id", communityIds)
    .or(PUBLISHED_FILTER());
  if (error) throw error;
  for (const row of data ?? []) {
    if (!row.community_id) continue;
    counts.set(row.community_id, (counts.get(row.community_id) ?? 0) + 1);
  }
  return counts;
}

export async function getCommunities(): Promise<Community[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("communities")
    .select("*")
    .or(PUBLISHED_FILTER())
    .order("sort_order", { ascending: true })
    .order("featured", { ascending: false })
    .order("member_count", { ascending: false });
  if (error) throw error;

  const postCounts = await getCommunityPostCounts(supabase, (data ?? []).map((c) => c.id));

  return (data ?? []).map((c) => ({
    id: c.id,
    slug: c.slug,
    name: c.name,
    description: c.description,
    coverImageUrl: c.cover_image_url,
    memberCount: c.member_count,
    postCount: postCounts.get(c.id) ?? 0,
    featured: c.featured,
    membershipPolicy: c.membership_policy as Community["membershipPolicy"],
    topic: c.topic,
    rules: c.rules,
    visibility: c.visibility as Community["visibility"],
    createdBy: c.created_by,
  }));
}

export async function getCommunityBySlug(slug: string): Promise<Community | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("communities")
    .select("*")
    .eq("slug", slug)
    .or(PUBLISHED_FILTER())
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;

  const postCounts = await getCommunityPostCounts(supabase, [data.id]);

  return {
    id: data.id,
    slug: data.slug,
    name: data.name,
    description: data.description,
    coverImageUrl: data.cover_image_url,
    memberCount: data.member_count,
    postCount: postCounts.get(data.id) ?? 0,
    featured: data.featured,
    membershipPolicy: data.membership_policy as Community["membershipPolicy"],
    topic: data.topic,
    rules: data.rules,
    visibility: data.visibility as Community["visibility"],
    createdBy: data.created_by,
  };
}

// Same shape as getCommunityBySlug — the discussion detail page only has
// the post's community_id on hand, not its slug.
export async function getCommunityById(id: string): Promise<Community | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("communities")
    .select("*")
    .eq("id", id)
    .or(PUBLISHED_FILTER())
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;

  const postCounts = await getCommunityPostCounts(supabase, [data.id]);

  return {
    id: data.id,
    slug: data.slug,
    name: data.name,
    description: data.description,
    coverImageUrl: data.cover_image_url,
    memberCount: data.member_count,
    postCount: postCounts.get(data.id) ?? 0,
    featured: data.featured,
    membershipPolicy: data.membership_policy as Community["membershipPolicy"],
    topic: data.topic,
    rules: data.rules,
    visibility: data.visibility as Community["visibility"],
    createdBy: data.created_by,
  };
}

export interface CustomFeedSummary {
  id: string;
  name: string;
  communityIds: string[];
}

// A viewer's own Reddit-style "Custom Feeds" — each one just a name plus
// the set of (their own joined) communities it aggregates.
export async function getMyCustomFeeds(profileId: string): Promise<CustomFeedSummary[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("custom_feeds")
    .select("id, name, custom_feed_communities(community_id)")
    .eq("profile_id", profileId)
    .order("created_at", { ascending: true });
  if (error) throw error;
  return (data ?? []).map((f) => ({
    id: f.id,
    name: f.name,
    communityIds: (f.custom_feed_communities ?? []).map((r) => r.community_id),
  }));
}

// Ownership is checked explicitly here (a friendly null/404 instead of a
// raw RLS-denied empty result) — RLS on custom_feeds is still the real
// enforcement underneath.
export async function getCustomFeedById(feedId: string, profileId: string): Promise<CustomFeedSummary | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("custom_feeds")
    .select("id, name, custom_feed_communities(community_id)")
    .eq("id", feedId)
    .eq("profile_id", profileId)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  return {
    id: data.id,
    name: data.name,
    communityIds: (data.custom_feed_communities ?? []).map((r) => r.community_id),
  };
}

// Which communities the given signed-in member has an ACTIVE (or muted —
// still a real member, just can't post) stake in — excludes 'pending'
// join requests, which must never count as membership (they'd otherwise
// leak that community's posts into the requester's personalized feed
// before anyone approved them). Real, persisted state (community_members),
// not client-only.
export async function getMyCommunityIds(profileId: string): Promise<Set<string>> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("community_members")
    .select("community_id")
    .eq("profile_id", profileId)
    .neq("status", "pending");
  if (error) throw error;

  return new Set((data ?? []).map((m) => m.community_id));
}

// Every community this profile can moderate — owns, or has an active
// moderator row in. Unlike myMembership (scoped to one community, used on
// a single community's own page), this covers every community at once, so
// the general /community feed (which mixes posts from many communities,
// with no single "active" community) can grant per-post moderator actions
// correctly instead of only ever checking the one community whose page
// happens to be open.
export async function getModeratedCommunityIds(profileId: string): Promise<Set<string>> {
  const supabase = await createClient();
  const [ownedRes, moderatedRes] = await Promise.all([
    supabase.from("communities").select("id").eq("created_by", profileId),
    supabase
      .from("community_members")
      .select("community_id")
      .eq("profile_id", profileId)
      .eq("role", "moderator")
      .eq("status", "active"),
  ]);
  if (ownedRes.error) throw ownedRes.error;
  if (moderatedRes.error) throw moderatedRes.error;

  return new Set([
    ...(ownedRes.data ?? []).map((c) => c.id),
    ...(moderatedRes.data ?? []).map((m) => m.community_id),
  ]);
}

export interface MyMembershipRow {
  communityId: string;
  communityName: string;
  communitySlug: string;
  status: "active" | "pending" | "muted";
  role: "member" | "moderator";
  isOwner: boolean;
  memberCount: number;
}

// Every community the viewer belongs to (or has a pending request into),
// for the /communities/manage directory page. Deliberately includes
// `pending` rows — unlike getMyCommunityIds, which excludes them for the
// "am I really a member" checks elsewhere — since a member should be able
// to see and cancel their own pending join requests here.
export async function getMyCommunityMemberships(profileId: string): Promise<MyMembershipRow[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("community_members")
    .select("status, role, communities(id, name, slug, member_count, created_by)")
    .eq("profile_id", profileId);
  if (error) throw error;

  return (data ?? [])
    .filter((r) => r.communities)
    .map((r) => {
      const community = r.communities as unknown as { id: string; name: string; slug: string; member_count: number; created_by: string | null };
      return {
        communityId: community.id,
        communityName: community.name,
        communitySlug: community.slug,
        status: r.status as "active" | "pending" | "muted",
        role: r.role as "member" | "moderator",
        isOwner: community.created_by === profileId,
        memberCount: community.member_count,
      };
    });
}

// The viewer's own relationship to one community — drives the Join/
// Requested/Joined/Invited button state and whether moderator-only UI
// (pending requests, members panel, invite) should render at all.
export async function getCommunityMembership(communityId: string, profileId: string): Promise<CommunityMembership> {
  const supabase = await createClient();
  const [{ data: community }, { data: membership }, { data: invite }] = await Promise.all([
    supabase.from("communities").select("created_by").eq("id", communityId).maybeSingle(),
    supabase.from("community_members").select("role, status").eq("community_id", communityId).eq("profile_id", profileId).maybeSingle(),
    supabase
      .from("community_invites")
      .select("id")
      .eq("community_id", communityId)
      .eq("invited_profile_id", profileId)
      .eq("status", "pending")
      .maybeSingle(),
  ]);

  return {
    status: (membership?.status as CommunityMembershipStatus) ?? "none",
    role: (membership?.role as "member" | "moderator") ?? "member",
    isOwner: !!community && community.created_by === profileId,
    invited: !!invite,
  };
}

// Active + pending members for the moderator "Manage members" panel — one
// list, distinguished by `status`, rather than two separate queries the
// UI would need to merge/reconcile itself.
export async function getCommunityMembers(communityId: string): Promise<CommunityMemberEntry[]> {
  const supabase = await createClient();
  const [{ data: community }, { data: rows, error }] = await Promise.all([
    supabase.from("communities").select("created_by").eq("id", communityId).maybeSingle(),
    supabase
      .from("community_members")
      .select("profile_id, role, status, joined_at")
      .eq("community_id", communityId)
      .in("status", ["active", "pending", "muted"])
      .order("joined_at", { ascending: true }),
  ]);
  if (error) throw error;

  const rowsList = rows ?? [];
  const authorMap = await getAuthorMap(supabase, rowsList.map((r) => r.profile_id));

  return rowsList.map((r) => {
    const author = authorMap.get(r.profile_id);
    return {
      profileId: r.profile_id,
      name: author?.name || "GovConUnited Member",
      avatarUrl: author?.avatarUrl ?? null,
      headline: author?.headline ?? null,
      jobTitle: author?.jobTitle ?? null,
      role: r.role as "member" | "moderator",
      status: r.status as "active" | "pending" | "muted",
      isOwner: !!community && community.created_by === r.profile_id,
      joinedAt: r.joined_at,
    };
  });
}

// The real audit trail behind every pin/lock/hide/remove/restore/move —
// moderate_post() writes one row here per action, regardless of type.
// SELECT is already RLS-gated to that community's own moderators.
export async function getPostModerationLog(communityId: string, limit = 30): Promise<ModerationLogEntry[]> {
  const supabase = await createClient();
  const { data: rows, error } = await supabase
    .from("post_moderation_log")
    .select("id, post_id, actor_profile_id, action, reason, from_community_id, to_community_id, created_at")
    .eq("community_id", communityId)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw error;

  const rowsList = rows ?? [];
  const [authorMap, postRes, communityRes] = await Promise.all([
    getAuthorMap(supabase, rowsList.map((r) => r.actor_profile_id)),
    supabase
      .from("posts")
      .select("id, title, slug")
      .in("id", rowsList.map((r) => r.post_id).length ? rowsList.map((r) => r.post_id) : [""]),
    supabase.from("communities").select("id, name"),
  ]);
  const postMap = new Map((postRes.data ?? []).map((p) => [p.id, p]));
  const communityNameMap = new Map((communityRes.data ?? []).map((c) => [c.id, c.name]));

  return rowsList.map((r) => {
    const post = postMap.get(r.post_id);
    return {
      id: r.id,
      postId: r.post_id,
      postTitle: post?.title ?? "(deleted post)",
      postRoute: post ? `community/discussion/${post.slug}` : null,
      actorName: authorMap.get(r.actor_profile_id)?.name || "GovConUnited Member",
      action: r.action as ModerationLogEntry["action"],
      reason: r.reason,
      fromCommunityName: r.from_community_id ? (communityNameMap.get(r.from_community_id) ?? null) : null,
      toCommunityName: r.to_community_id ? (communityNameMap.get(r.to_community_id) ?? null) : null,
      createdAt: r.created_at,
    };
  });
}

// The real prior-version trail behind a post's "Edited" timestamp — one row
// per updatePostAction call, captured before the new text overwrites it.
// RLS mirrors posts' own visibility, so no extra filtering here.
export async function getPostEditHistory(postId: string): Promise<EditHistoryEntry[]> {
  const supabase = await createClient();
  const { data: rows, error } = await supabase
    .from("post_edit_history")
    .select("id, editor_profile_id, previous_title, previous_body, edited_at")
    .eq("post_id", postId)
    .order("edited_at", { ascending: false });
  if (error) throw error;

  const rowsList = rows ?? [];
  const authorMap = await getAuthorMap(supabase, rowsList.map((r) => r.editor_profile_id));
  return rowsList.map((r) => ({
    id: r.id,
    editorName: authorMap.get(r.editor_profile_id)?.name || "GovConUnited Member",
    previousTitle: r.previous_title,
    previousBody: r.previous_body,
    editedAt: r.edited_at,
  }));
}

export async function getCommentEditHistory(commentId: string): Promise<EditHistoryEntry[]> {
  const supabase = await createClient();
  const { data: rows, error } = await supabase
    .from("comment_edit_history")
    .select("id, editor_profile_id, previous_body, edited_at")
    .eq("comment_id", commentId)
    .order("edited_at", { ascending: false });
  if (error) throw error;

  const rowsList = rows ?? [];
  const authorMap = await getAuthorMap(supabase, rowsList.map((r) => r.editor_profile_id));
  return rowsList.map((r) => ({
    id: r.id,
    editorName: authorMap.get(r.editor_profile_id)?.name || "GovConUnited Member",
    previousBody: r.previous_body,
    editedAt: r.edited_at,
  }));
}

// Which posts the given signed-in user has already upvoted — real, persisted
// per-account state (post_votes table) rather than client-only React state
// that reset on every page load and wasn't tied to who voted.
export async function getVotedPostIds(userId: string): Promise<Set<string>> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("post_votes")
    .select("post_id")
    .eq("user_id", userId);
  if (error) throw error;

  return new Set((data ?? []).map((v) => v.post_id));
}

// The signed-in user's own upvote/downvote per community post — a real
// direction, not just the boolean getVotedPostIds gives the LinkedIn-style
// feed, so the Reddit-style vote pill can render the correct arrow as
// already pressed (and know which way to toggle) after a page reload.
export async function getMyPostVoteDirections(userId: string): Promise<Map<string, "up" | "down">> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("post_votes")
    .select("post_id, reaction_type")
    .eq("user_id", userId)
    .in("reaction_type", ["upvote", "downvote"]);
  if (error) throw error;

  return new Map((data ?? []).map((v) => [v.post_id, v.reaction_type === "downvote" ? "down" : "up"]));
}

export async function getTestimonials(): Promise<Testimonial[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("testimonials")
    .select("*")
    .or(PUBLISHED_FILTER())
    .order("sort_order");
  if (error) throw error;

  return (data ?? []).map((t) => ({
    quote: t.quote,
    name: t.name,
    role: t.role,
    initials: t.initials,
    verified: t.verified,
  }));
}

export interface PlatformMetric {
  label: string;
  value: string;
}

// Real row counts from the production database — replaces any hard-coded
// "12,845+ Opportunities" style marketing numbers on the landing page. Each
// count can be overridden per metric via platform_metrics.override_value
// (admin-managed, /admin/metrics) for a real, maintained marketing figure
// (e.g. a cumulative total) distinct from the live listing count — never a
// literal hardcoded in markup either way.
export async function getPlatformMetrics(): Promise<PlatformMetric[]> {
  const supabase = await createClient();
  const [opportunities, jobs, companies, profiles, events, { data: overrides }] = await Promise.all([
    supabase.from("opportunities").select("*", { count: "exact", head: true }).or(PUBLISHED_FILTER()),
    supabase.from("jobs").select("*", { count: "exact", head: true }).or(PUBLISHED_FILTER()),
    supabase.from("companies").select("*", { count: "exact", head: true }).or(PUBLISHED_FILTER()),
    supabase.from("profiles").select("*", { count: "exact", head: true }),
    supabase.from("events").select("*", { count: "exact", head: true }).or(PUBLISHED_FILTER()),
    supabase.from("platform_metrics").select("metric_key, label, override_value").order("sort_order"),
  ]);

  const counts = [opportunities, jobs, companies, profiles, events];
  for (const result of counts) {
    if (result.error) throw result.error;
  }

  const liveCount: Record<string, number> = {
    opportunities: opportunities.count ?? 0,
    jobs: jobs.count ?? 0,
    companies: companies.count ?? 0,
    // "Professionals" is every real registered account — members was
    // always the seeded stand-in table, never real accounts.
    professionals: profiles.count ?? 0,
    events: events.count ?? 0,
  };

  return (overrides ?? []).map((m) => ({
    label: m.label,
    value: (m.override_value ?? liveCount[m.metric_key] ?? 0).toLocaleString("en-US"),
  }));
}

export interface Partner {
  id: string;
  name: string;
  logoUrl: string | null;
  websiteUrl: string | null;
  placement: "carousel" | "footer";
}

// The 4 approved home-page carousel partners + 4 footer-only partners
// (20260919000400_partners_metrics_settings_notices.sql) — replaces the
// hardcoded partner name strings that used to live in landing-data.ts.
export async function getPartners(): Promise<Partner[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("partners")
    .select("id, name, logo_url, website_url, placement")
    .or(PUBLISHED_FILTER())
    .order("sort_order");
  if (error) throw error;

  return (data ?? []).map((p) => ({
    id: p.id,
    name: p.name,
    logoUrl: p.logo_url,
    websiteUrl: p.website_url,
    placement: p.placement as "carousel" | "footer",
  }));
}

export interface GovConNewsItem {
  id: string;
  slug: string;
  headline: string;
  summary: string;
  sourceName: string;
  sourceUrl: string;
  publishedAt: string;
}

// Real admin-authored news items — replaces the dashboard's old "Community
// Highlights" filler with the real "GovCon News" panel the design calls for.
export async function getGovConNews(limit = 5): Promise<GovConNewsItem[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("govcon_news")
    .select("id, slug, headline, summary, source_name, source_url, published_at")
    .or(PUBLISHED_FILTER())
    .order("featured", { ascending: false })
    .order("published_at", { ascending: false })
    .limit(limit);
  if (error) throw error;

  return (data ?? []).map((n) => ({
    id: n.id,
    slug: n.slug,
    headline: n.headline,
    summary: n.summary,
    sourceName: n.source_name,
    sourceUrl: n.source_url,
    publishedAt: n.published_at,
  }));
}

export interface SponsoredContentItem {
  id: string;
  sponsorName: string;
  headline: string;
  body: string;
  imageUrl: string | null;
  ctaLabel: string;
  ctaUrl: string;
}

// Single most-recently-published sponsored card — deterministic pick, no
// ad-rotation logic needed at this scale.
export async function getSponsoredContent(): Promise<SponsoredContentItem | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("sponsored_content")
    .select("id, sponsor_name, headline, body, image_url, cta_label, cta_url")
    .or(PUBLISHED_FILTER())
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;

  return {
    id: data.id,
    sponsorName: data.sponsor_name,
    headline: data.headline,
    body: data.body,
    imageUrl: data.image_url,
    ctaLabel: data.cta_label,
    ctaUrl: data.cta_url,
  };
}

export interface SiteSettings {
  socialFacebookUrl: string | null;
  socialXUrl: string | null;
  socialInstagramUrl: string | null;
  socialLinkedinUrl: string | null;
  appStoreUrl: string | null;
  googlePlayUrl: string | null;
}

// Real social/app-store footer links, admin-managed (/admin/settings) —
// null hides the icon/badge on the public site rather than linking to a
// placeholder that isn't a real account or listing.
export async function getSiteSettings(): Promise<SiteSettings> {
  const supabase = await createClient();
  const { data, error } = await supabase.from("site_settings").select("key, value");
  if (error) throw error;

  const byKey = new Map((data ?? []).map((s) => [s.key, s.value]));
  return {
    socialFacebookUrl: byKey.get("social_facebook_url") ?? null,
    socialXUrl: byKey.get("social_x_url") ?? null,
    socialInstagramUrl: byKey.get("social_instagram_url") ?? null,
    socialLinkedinUrl: byKey.get("social_linkedin_url") ?? null,
    appStoreUrl: byKey.get("app_store_url") ?? null,
    googlePlayUrl: byKey.get("google_play_url") ?? null,
  };
}

export interface ActiveNotice {
  id: string;
  message: string;
  level: "info" | "warning";
}

// The site-wide announcement banner (/admin/notices) — active means
// published, already started, and not yet past its end date (an admin
// never has to remember to manually take it down on time).
export async function getActiveNotice(): Promise<ActiveNotice | null> {
  const supabase = await createClient();
  const nowIso = new Date().toISOString();
  const { data, error } = await supabase
    .from("notices")
    .select("id, message, level")
    .eq("status", "published")
    .lte("starts_at", nowIso)
    .or(`ends_at.is.null,ends_at.gte.${nowIso}`)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  return { id: data.id, message: data.message, level: data.level as "info" | "warning" };
}

export async function getLandingContent() {
  const [
    opportunities,
    companies,
    jobs,
    jobCategories,
    members,
    networkMembers,
    events,
    posts,
    testimonials,
    metrics,
    resources,
    partners,
    communities,
  ] = await Promise.all([
    getOpportunities(),
    getCompanies(),
    getJobs(),
    getJobCategories(),
    getTopContributors(null, 5),
    getNetworkMembers(),
    getEvents(),
    getPosts(),
    getTestimonials(),
    getPlatformMetrics(),
    getResources(),
    getPartners(),
    getCommunities(),
  ]);

  return {
    opportunities,
    companies,
    // Closed jobs no longer take applications — not worth promoting.
    jobs: jobs.filter((j) => j.closedAt == null),
    jobCategories,
    members,
    networkMembers,
    events,
    posts,
    testimonials,
    metrics,
    resources,
    partners,
    communities,
  };
}

// ------------------------------------------------------------- messaging

// "GovConUnited Member" fallback for anyone whose name we couldn't resolve
// (shouldn't normally happen once network_members is queried, but a
// deleted/inaccessible profile is a real possibility).
export function initialsFromName(name: string): string {
  return (
    name
      .split(" ")
      .filter(Boolean)
      .map((w) => w[0])
      .slice(0, 2)
      .join("")
      .toUpperCase() || "GC"
  );
}

// Every real conversation the signed-in user is part of, newest activity
// first, with the other participant's name/initials and an unread count —
// computed from a second batched query rather than N+1 queries per row.
// The other participant's name comes from network_members (not a
// `profiles!...fkey` embed) for the same RLS reason documented on
// getAuthorMap: `profiles` only allows a member to read their OWN row.
export async function getConversations(userId: string): Promise<Conversation[]> {
  const supabase = await createClient();
  const { data: conversations, error } = await supabase
    .from("conversations")
    .select("id, member_one_id, member_two_id, last_message_at")
    .or(`member_one_id.eq.${userId},member_two_id.eq.${userId}`)
    .order("last_message_at", { ascending: false });
  if (error) throw error;
  if (!conversations || conversations.length === 0) return [];

  const otherIds = conversations.map((c) => (c.member_one_id === userId ? c.member_two_id : c.member_one_id));
  const authorMap = await getAuthorMap(supabase, otherIds);

  // network_members, not profiles directly — profiles' own RLS only lets a
  // user read their own row, so this would silently return nothing for
  // every other participant otherwise (see 20260924030000_network_members_away_message.sql).
  const { data: awayRows } = await supabase
    .from("network_members")
    .select("id, away_message, away_message_enabled")
    .in("id", [...new Set(otherIds)]);
  const awayMessageMap = new Map(
    (awayRows ?? []).filter((r) => r.away_message_enabled).map((r) => [r.id, r.away_message]),
  );

  const ids = conversations.map((c) => c.id);
  const { data: messages, error: messagesError } = await supabase
    .from("messages")
    .select("conversation_id, sender_id, body, image_url, read_at, created_at")
    .in("conversation_id", ids)
    .order("created_at", { ascending: true });
  if (messagesError) throw messagesError;

  return conversations.map((c) => {
    const otherId = c.member_one_id === userId ? c.member_two_id : c.member_one_id;
    const name = authorMap.get(otherId)?.name || "GovConUnited Member";
    const convoMessages = (messages ?? []).filter((m) => m.conversation_id === c.id);
    const last = convoMessages[convoMessages.length - 1];
    const unreadCount = convoMessages.filter((m) => m.sender_id !== userId && !m.read_at).length;
    // An image-only message has an empty body — "📷 Photo" gives the
    // conversation-list preview something to show instead of blank text.
    const preview = last ? (last.body || (last.image_url ? "📷 Photo" : "")) : "";
    return {
      id: c.id,
      otherMemberId: otherId,
      otherMemberName: name,
      otherMemberInitials: initialsFromName(name),
      otherMemberAvatarUrl: authorMap.get(otherId)?.avatarUrl ?? null,
      otherMemberHeadline: authorMap.get(otherId)?.headline ?? null,
      otherMemberJobTitle: authorMap.get(otherId)?.jobTitle ?? null,
      otherMemberAwayMessage: awayMessageMap.get(otherId) ?? null,
      lastMessageAt: c.last_message_at,
      lastMessagePreview: preview,
      unreadCount,
    };
  });
}

// Lightweight count for the shell's Messages badge — a dedicated query
// rather than reusing getConversations(), since this runs on every
// dashboard-shell page load.
export async function getUnreadMessageCount(userId: string): Promise<number> {
  const supabase = await createClient();
  const { count, error } = await supabase
    .from("messages")
    .select("id, conversations!inner(member_one_id,member_two_id)", { count: "exact", head: true })
    .is("read_at", null)
    .neq("sender_id", userId)
    .or(`member_one_id.eq.${userId},member_two_id.eq.${userId}`, { foreignTable: "conversations" });
  if (error) throw error;
  return count ?? 0;
}

export interface NotificationItem {
  id: string;
  type: string;
  title: string;
  body: string | null;
  linkPath: string;
  readAt: string | null;
  createdAt: string;
  actorName: string | null;
  actorAvatarUrl: string | null;
}

// connection_request is deliberately excluded here (and in getNotifications
// below) — LinkedIn-style, that type has its own dedicated surface (the
// Network nav badge + the Requests tab it deep-links to via
// /api/network/pending-count), not the general notification bell. The
// underlying `notifications` row is still created (so email delivery for
// it keeps working), just never surfaced through this bell/count/list path.
export async function getUnreadNotificationCount(userId: string): Promise<number> {
  const supabase = await createClient();
  const { count, error } = await supabase
    .from("notifications")
    .select("id", { count: "exact", head: true })
    .eq("recipient_id", userId)
    .is("read_at", null)
    .neq("type", "connection_request");
  if (error) throw error;
  return count ?? 0;
}

// actorName comes from network_members (not a `profiles!actor_id` embed) —
// the same RLS reason as everywhere else: `profiles` only lets a member
// read their own row, so an embed there silently nulled out every actor
// who wasn't the viewer themselves.
export async function getNotifications(userId: string, limit = 20): Promise<NotificationItem[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("notifications")
    .select("id, type, title, body, link_path, read_at, created_at, actor_id")
    .eq("recipient_id", userId)
    .neq("type", "connection_request")
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw error;

  const rows = (data ?? []) as Tables<"notifications">[];
  const authorMap = await getAuthorMap(supabase, rows.map((n) => n.actor_id).filter((id): id is string => !!id));

  return rows.map((n) => ({
    id: n.id,
    type: n.type,
    title: n.title,
    body: n.body,
    linkPath: n.link_path,
    readAt: n.read_at,
    createdAt: n.created_at,
    actorName: n.actor_id ? (authorMap.get(n.actor_id)?.name ?? null) : null,
    actorAvatarUrl: n.actor_id ? (authorMap.get(n.actor_id)?.avatarUrl ?? null) : null,
  }));
}

export async function getMessages(conversationId: string, userId: string): Promise<MessageItem[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("messages")
    .select("id, sender_id, body, image_url, created_at, recommendation_request_id")
    .eq("conversation_id", conversationId)
    .order("created_at", { ascending: true });
  if (error) throw error;

  return (data ?? []).map((m) => ({
    id: m.id,
    senderId: m.sender_id,
    body: m.body,
    imageUrl: m.image_url,
    createdAt: m.created_at,
    mine: m.sender_id === userId,
    recommendationRequestId: m.recommendation_request_id,
  }));
}

// -------------------------------------------------------- profile views

// Real "Profile viewers" count for the dashboard home stats card — replaces
// the mockup's fixed fake number. Records nothing for self-views.
export async function recordProfileView(viewerId: string, viewedProfileId: string): Promise<void> {
  if (viewerId === viewedProfileId) return;
  const supabase = await createClient();
  await supabase.from("profile_views").insert({ viewer_id: viewerId, viewed_profile_id: viewedProfileId });
}

export async function getProfileViewCount(userId: string): Promise<number> {
  const supabase = await createClient();
  const { count, error } = await supabase
    .from("profile_views")
    .select("id", { count: "exact", head: true })
    .eq("viewed_profile_id", userId);
  if (error) throw error;
  return count ?? 0;
}

// ---------------------------------------------------------- post views

// Real "Post impressions" — the sum of real views across the member's own
// real (author_profile_id-backed) posts. Scoped to one surface: "feed"
// (Home posts, community_id null — what the dashboard stats card shows) or
// "community" (discussions posted inside a community). The two are separate
// products and never pooled. A member with no posts honestly gets 0.
export async function recordPostView(postId: string, viewerId: string | null): Promise<void> {
  const supabase = await createClient();
  await supabase.from("post_views").insert({ post_id: postId, viewer_id: viewerId });
}

export async function getPostImpressionCount(userId: string, scope: "feed" | "community" = "feed"): Promise<number> {
  const supabase = await createClient();
  let postsQuery = supabase.from("posts").select("id").eq("author_profile_id", userId);
  postsQuery = scope === "feed" ? postsQuery.is("community_id", null) : postsQuery.not("community_id", "is", null);
  const { data: myPosts, error: postsError } = await postsQuery;
  if (postsError) throw postsError;
  const ids = (myPosts ?? []).map((p) => p.id);
  if (ids.length === 0) return 0;

  const { count, error } = await supabase
    .from("post_views")
    .select("id", { count: "exact", head: true })
    .in("post_id", ids);
  if (error) throw error;
  return count ?? 0;
}

export interface RecentlyViewedPost {
  postId: string;
  route: string;
  title: string;
  body: string;
  postType: string;
  imageUrl: string | null;
  category: string;
  postedAgo: string;
  votes: number;
  comments: number;
  communityName: string | null;
  communitySlug: string | null;
}

// The Community sidebar's "Recent Posts" panel (real per-viewer view
// history under the hood — see post_views — matching what Reddit's own
// "RECENT POSTS" widget is, despite the friendlier label) — a lean,
// purpose-built row rather than the full Post shape from getPosts(), since
// this panel doesn't need a second full feed join per page load. Over-
// fetches raw view rows (the same post can be viewed repeatedly) and
// dedupes by post_id, keeping only the most recent view.
export async function getRecentlyViewedPosts(viewerId: string, limit = 8): Promise<RecentlyViewedPost[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("post_views")
    .select(
      "post_id, created_at, posts(id, slug, title, body, post_type, category, votes, comment_count, posted_at, cover_image_url, post_media(kind,storage_path,sort_order), communities(name, slug))",
    )
    .eq("viewer_id", viewerId)
    .order("created_at", { ascending: false })
    .limit(limit * 5);
  if (error) throw error;

  const seen = new Set<string>();
  const result: RecentlyViewedPost[] = [];
  for (const row of data ?? []) {
    const post = row.posts as unknown as {
      id: string;
      slug: string;
      title: string;
      body: string;
      post_type: string;
      category: string;
      votes: number;
      comment_count: number;
      posted_at: string;
      cover_image_url: string | null;
      post_media: { kind: string; storage_path: string; sort_order: number }[];
      communities: { name: string; slug: string } | null;
    } | null;
    // Community-only panel — a Home feed post the viewer looked at (e.g. via
    // a notification link) isn't a community discussion and never shows here.
    if (!post || !post.communities || seen.has(post.id)) continue;
    seen.add(post.id);
    const firstImage = (post.post_media ?? [])
      .slice()
      .sort((a, b) => a.sort_order - b.sort_order)
      .find((m) => m.kind === "image");
    const imageUrl = firstImage
      ? `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/${MEDIA_BUCKET.image}/${firstImage.storage_path}`
      : post.cover_image_url;
    result.push({
      postId: post.id,
      route: `community/discussion/${post.slug}`,
      title: post.title,
      body: post.body,
      postType: post.post_type,
      imageUrl,
      category: post.category,
      postedAgo: formatRelativeTime(post.posted_at),
      votes: post.votes,
      comments: post.comment_count,
      communityName: post.communities?.name ?? null,
      communitySlug: post.communities?.slug ?? null,
    });
    if (result.length >= limit) break;
  }
  return result;
}

// ---------------------------------------------------------- connections

// Real, server-persisted connections — see connections_unique_pair_idx.
// Replaces the previous localStorage-only "gcuConnections" set. Only
// "accepted" rows count as an actual connection now that connecting is a
// real request/accept flow (20260918010800_connection_requests.sql) — a
// pending request isn't a connection yet.
export async function getConnectionIds(userId: string): Promise<Set<string>> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("connections")
    .select("member_one_id, member_two_id")
    .eq("status", "accepted")
    .or(`member_one_id.eq.${userId},member_two_id.eq.${userId}`);
  if (error) throw error;
  return new Set((data ?? []).map((c) => (c.member_one_id === userId ? c.member_two_id : c.member_one_id)));
}

export async function getConnections(userId: string): Promise<NetworkMember[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("connections")
    .select("id, member_one_id, member_two_id, created_at")
    .eq("status", "accepted")
    .or(`member_one_id.eq.${userId},member_two_id.eq.${userId}`)
    .order("created_at", { ascending: false });
  if (error) throw error;

  const rows = data ?? [];
  const otherIds = rows.map((c) => (c.member_one_id === userId ? c.member_two_id : c.member_one_id));
  const authorMap = await getAuthorMap(supabase, otherIds);

  return rows.map((c) => {
    const otherId = c.member_one_id === userId ? c.member_two_id : c.member_one_id;
    const name = authorMap.get(otherId)?.name || "GovConUnited Member";
    return {
      id: otherId,
      name,
      initials: initialsFromName(name),
      avatarUrl: authorMap.get(otherId)?.avatarUrl ?? null,
      isPro: authorMap.get(otherId)?.isPro ?? false,
      headline: authorMap.get(otherId)?.headline ?? null,
      jobTitle: authorMap.get(otherId)?.jobTitle ?? null,
      companyName: authorMap.get(otherId)?.companyName ?? null,
    };
  });
}

// One row per real connection *or* pending request the viewer is part of,
// keyed by the other member's id — lets a single query drive the Connect/
// Pending/Accept-Decline/Connected button state everywhere (Find People
// grid, member profile hero, dashboard suggested connection) without an
// extra round trip per card.
export interface ConnectionState {
  connectionId: string;
  status: "pending" | "accepted";
  requestedByMe: boolean;
}

export async function getConnectionStates(userId: string): Promise<Map<string, ConnectionState>> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("connections")
    .select("id, member_one_id, member_two_id, status, requested_by")
    .or(`member_one_id.eq.${userId},member_two_id.eq.${userId}`);
  if (error) throw error;

  const map = new Map<string, ConnectionState>();
  for (const c of data ?? []) {
    const otherId = c.member_one_id === userId ? c.member_two_id : c.member_one_id;
    map.set(otherId, {
      connectionId: c.id,
      status: c.status as "pending" | "accepted",
      requestedByMe: c.requested_by === userId,
    });
  }
  return map;
}

// Real pending requests sent *to* the viewer — backs the "Connection
// Requests" tab. Requests the viewer sent themselves are excluded (those
// show as "Pending" on the sender's own Connect button instead).
export async function getConnectionRequests(
  userId: string,
): Promise<Array<NetworkMember & { connectionId: string }>> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("connections")
    .select("id, member_one_id, member_two_id, requested_by, created_at")
    .eq("status", "pending")
    .neq("requested_by", userId)
    .or(`member_one_id.eq.${userId},member_two_id.eq.${userId}`)
    .order("created_at", { ascending: false });
  if (error) throw error;

  const rows = data ?? [];
  const otherIds = rows.map((c) => (c.member_one_id === userId ? c.member_two_id : c.member_one_id));
  const authorMap = await getAuthorMap(supabase, otherIds);

  return rows.map((c) => {
    const otherId = c.member_one_id === userId ? c.member_two_id : c.member_one_id;
    const name = authorMap.get(otherId)?.name || "GovConUnited Member";
    return {
      id: otherId,
      name,
      initials: initialsFromName(name),
      avatarUrl: authorMap.get(otherId)?.avatarUrl ?? null,
      isPro: authorMap.get(otherId)?.isPro ?? false,
      headline: authorMap.get(otherId)?.headline ?? null,
      jobTitle: authorMap.get(otherId)?.jobTitle ?? null,
      companyName: authorMap.get(otherId)?.companyName ?? null,
      connectionId: c.id,
    };
  });
}

// Real "Network growth" for the dashboard home stats card — connections
// made in the last 30 days as a percentage of connections made before that.
// No baseline (nothing before the last 30 days) reports growthPct as null
// rather than a made-up percentage; the caller shows the raw `recent` count
// ("+2") then.
export async function getNetworkGrowth(
  userId: string,
): Promise<{ count: number; recent: number; growthPct: number | null }> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("connections")
    .select("accepted_at")
    .eq("status", "accepted")
    .or(`member_one_id.eq.${userId},member_two_id.eq.${userId}`);
  if (error) throw error;

  // Buckets by accepted_at (when the connection actually formed), not
  // created_at (when it was requested) — a request pending for weeks then
  // accepted today must count as recent growth, not old activity.
  const rows = data ?? [];
  const count = rows.length;
  const thirtyDaysAgo = Date.now() - 30 * 24 * 60 * 60 * 1000;
  const recent = rows.filter((r) => r.accepted_at && new Date(r.accepted_at).getTime() >= thirtyDaysAgo).length;
  const prior = count - recent;
  const growthPct = prior > 0 ? Math.round((recent / prior) * 100) : null;
  return { count, recent, growthPct };
}

// Real mutual-connection count for a Suggested Connection card — the
// intersection of two members' real connection sets. Replaces the
// mockup's fake stack of random mutual-connection photos.
export async function getMutualConnectionCount(userId: string, otherId: string): Promise<number> {
  const [mine, theirs] = await Promise.all([getConnectionIds(userId), getConnectionIds(otherId)]);
  let count = 0;
  for (const id of mine) if (theirs.has(id)) count++;
  return count;
}

export async function getMutualConnections(userId: string, otherId: string): Promise<NetworkMember[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("get_mutual_connection_ids", { target_profile_id: otherId });
  if (error) {
    if (error.code === "42883" || error.code === "PGRST202") {
      console.error("Mutual connections RPC is unavailable; apply the latest Supabase migration.", error.message);
      return [];
    }
    throw error;
  }
  const mutualIds = new Set((data ?? []).map((row) => row.profile_id));
  const members = await getNetworkMembers();
  return members.filter((member) => mutualIds.has(member.id));
}

// Real "Suggested Connection(s)" ranking — replaces the old naive "most
// recently joined non-connection" single pick. Ranks by real
// mutual-connection count (one batched query, not N+1 calls to
// getMutualConnectionCount), falling back to the old recency-based
// behavior only when the viewer has zero connections yet (mutual count is
// undefined for a brand-new account, so a fallback is the honest choice).
export async function getSuggestedConnections(
  viewerId: string,
  limit = 3,
): Promise<(NetworkMember & { mutualCount: number; boosted?: boolean })[]> {
  const supabase = await createClient();
  const connectionIds = await getConnectionIds(viewerId);
  // Members with an active Rewards-store "Profile boost" rank first (labeled Boosted).
  const { data: boostRows } = await supabase.rpc("points_active_boosts", { p_kind: "profile" });
  const boostedIds = new Set((boostRows ?? []).map((r) => r.target_id));

  const { data: pendingRows, error: pendingError } = await supabase
    .from("connections")
    .select("member_one_id, member_two_id")
    .eq("status", "pending")
    .or(`member_one_id.eq.${viewerId},member_two_id.eq.${viewerId}`);
  if (pendingError) throw pendingError;
  const pendingIds = (pendingRows ?? []).map((r) => (r.member_one_id === viewerId ? r.member_two_id : r.member_one_id));

  const excluded = new Set([viewerId, ...connectionIds, ...pendingIds]);

  const [members, { data: viewerProfile }] = await Promise.all([
    getNetworkMembers(),
    supabase.from("profiles").select("open_to").eq("id", viewerId).maybeSingle(),
  ]);
  // All of the viewer's "open to" choices count toward matching (e.g. a
  // member subcontracting to primes is shown primes hiring subcontractors).
  const viewerOpenTo = normalizeOpenTo(viewerProfile?.open_to);
  const candidates = members.filter((member) => !excluded.has(member.id));
  const ranked = await Promise.all(candidates.map(async (member) => {
    const mutuals = await getMutualConnections(viewerId, member.id);
    return {
      ...member,
      mutualCount: mutuals.length,
      boosted: boostedIds.has(member.id),
      matchScore: openToMatchScore(viewerOpenTo, member.openTo ?? []),
    };
  }));
  return ranked
    .sort((a, b) => Number(b.boosted) - Number(a.boosted) || b.matchScore - a.matchScore || b.mutualCount - a.mutualCount)
    .slice(0, limit);
}

export interface NewMemberEntry {
  id: string;
  name: string;
  avatarUrl: string | null;
  headline: string | null;
  jobTitle: string | null;
  isPro: boolean;
  isConnection: boolean;
  isFollowing: boolean;
}

// Real "New members" — the most recently joined real accounts, excluding
// the viewer, existing connections, and pending requests either direction
// (nothing to Connect/Follow there that isn't already covered elsewhere).
// Distinct from getSuggestedConnections (which ranks by mutual-connection
// count) — this is purely recency, matching a real "who just joined"
// widget rather than a "people you may know" one.
export async function getNewMembers(viewerId: string, limit = 5): Promise<NewMemberEntry[]> {
  const supabase = await createClient();
  const [connectionIds, followIds] = await Promise.all([getConnectionIds(viewerId), getProfileFollowIds(viewerId)]);

  const { data: pendingRows, error: pendingError } = await supabase
    .from("connections")
    .select("member_one_id, member_two_id")
    .eq("status", "pending")
    .or(`member_one_id.eq.${viewerId},member_two_id.eq.${viewerId}`);
  if (pendingError) throw pendingError;
  const pendingIds = (pendingRows ?? []).map((r) => (r.member_one_id === viewerId ? r.member_two_id : r.member_one_id));

  const excluded = new Set([viewerId, ...connectionIds, ...pendingIds]);

  const { data, error } = await supabase
    .from("network_members")
    .select("id, first_name, last_name, avatar_url, headline, job_title, plan_selection")
    .order("created_at", { ascending: false })
    .limit(limit + excluded.size);
  if (error) throw error;

  return (data ?? [])
    .filter((m): m is typeof m & { id: string } => !!m.id && !excluded.has(m.id))
    .slice(0, limit)
    .map((m) => ({
      id: m.id,
      name: `${m.first_name ?? ""} ${m.last_name ?? ""}`.trim() || "GovConUnited Member",
      avatarUrl: m.avatar_url,
      headline: m.headline,
      jobTitle: m.job_title,
      isPro: m.plan_selection === "pro",
      isConnection: connectionIds.has(m.id),
      isFollowing: followIds.has(m.id),
    }));
}

// -------------------------------------------------------- job engagement

// Real saved/applied state — replaces the previous localStorage-only
// "gcuSavedJobs"/"gcuAppliedJobs" sets (job_saves/job_applications,
// 20260918010900_job_engagement.sql).
export async function getJobSaveIds(profileId: string): Promise<Set<string>> {
  const supabase = await createClient();
  const { data, error } = await supabase.from("job_saves").select("job_id").eq("profile_id", profileId);
  if (error) throw error;
  return new Set((data ?? []).map((r) => r.job_id));
}

export async function getJobApplicationIds(profileId: string): Promise<Set<string>> {
  const supabase = await createClient();
  const { data, error } = await supabase.from("job_applications").select("job_id").eq("profile_id", profileId);
  if (error) throw error;
  return new Set((data ?? []).map((r) => r.job_id));
}

// Applications in the current calendar month — the Free plan's real "Apply
// to up to 10 jobs per month" limit (see freePlanFeatures/proPlanFeatures
// in landing-data.ts); Pro members have unlimited applications.
export async function getJobApplicationCountThisMonth(profileId: string): Promise<number> {
  const supabase = await createClient();
  const monthStart = new Date();
  monthStart.setUTCDate(1);
  monthStart.setUTCHours(0, 0, 0, 0);
  const { count, error } = await supabase
    .from("job_applications")
    .select("id", { count: "exact", head: true })
    .eq("profile_id", profileId)
    .gte("created_at", monthStart.toISOString());
  if (error) throw error;
  return count ?? 0;
}

// Pro's application rate limit resets hourly (not monthly like Free's cap)
// since Pro is meant to be "unlimited but rate-limited" per spec 9.4, not
// capped at a small absolute number.
export async function getJobApplicationCountLastHour(profileId: string): Promise<number> {
  const supabase = await createClient();
  const hourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
  const { count, error } = await supabase
    .from("job_applications")
    .select("id", { count: "exact", head: true })
    .eq("profile_id", profileId)
    .gte("created_at", hourAgo);
  if (error) throw error;
  return count ?? 0;
}

// ------------------------------------------------- opportunity engagement

// Opportunities in the member's Bid Tracker (any stage). Saved
// opportunities merged into the tracker as its "Interested" stage
// (20261001000900), so this is also what the bookmark/Track state reads.
export async function getTrackedOpportunityIds(profileId: string): Promise<Set<string>> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("opportunity_tracking")
    .select("opportunity_id")
    .eq("profile_id", profileId);
  if (error) throw error;
  return new Set((data ?? []).map((r) => r.opportunity_id));
}

export async function getOpportunityResponseIds(profileId: string): Promise<Set<string>> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("opportunity_responses")
    .select("opportunity_id")
    .eq("profile_id", profileId);
  if (error) throw error;
  return new Set((data ?? []).map((r) => r.opportunity_id));
}

export interface OpportunityResponder {
  responseId: string;
  profileId: string;
  name: string;
  avatarUrl: string | null;
  headline: string | null;
  jobTitle: string | null;
  companyName: string | null;
  location: string | null;
  skills: string[];
  phone: string | null;
  respondedAt: string;
  clearance: string | null;
  clearanceVerified: boolean;
}

// Company-facing "who's interested" list for an opportunity the viewer's
// company posted — LinkedIn-style, not a hiring pipeline: read-only, no
// status/notes/assignment (see 20260922000200_opportunity_responders_
// visibility.sql). A response itself carries no application content
// (just profile_id + opportunity_id + created_at), so what's shown here
// is the responder's real, current public profile info — never invented.
export async function getOpportunityRespondersForOpportunity(opportunityId: string): Promise<OpportunityResponder[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("opportunity_responses")
    .select("id, profile_id, created_at")
    .eq("opportunity_id", opportunityId)
    .order("created_at", { ascending: false });
  if (error) throw error;

  const profileIds = (data ?? []).map((r) => r.profile_id);
  if (profileIds.length === 0) return [];

  const { data: members } = await supabase
    .from("network_members")
    .select("id, first_name, last_name, avatar_url, headline, job_title, company_name, location, skills, phone, clearance, clearance_verified")
    .in("id", profileIds);
  const byId = new Map((members ?? []).map((m) => [m.id, m]));

  return (data ?? []).map((r) => {
    const m = byId.get(r.profile_id);
    return {
      responseId: r.id,
      profileId: r.profile_id,
      name: m ? `${m.first_name} ${m.last_name}`.trim() : "Member",
      avatarUrl: m?.avatar_url ?? null,
      headline: m?.headline ?? null,
      jobTitle: m?.job_title ?? null,
      companyName: m?.company_name ?? null,
      location: m?.location ?? null,
      skills: m?.skills ?? [],
      phone: m?.phone ?? null,
      respondedAt: r.created_at,
      clearance: m?.clearance && m.clearance !== "None" ? m.clearance : null,
      clearanceVerified: m?.clearance_verified === true,
    };
  });
}

export interface RecommendedPartner {
  profileId: string;
  name: string;
  companyName: string | null;
  avatarUrl: string | null;
  roleTypes: string[];
  matchReasons: string[];
  score: number;
}

// Recommended teaming partners for an opportunity (spec 9.3): matches
// active teaming_interests against the opportunity's NAICS code and
// performance state, using each profile's own real naics_interests/
// certifications/location fields (not a fabricated capability model).
export async function getRecommendedPartners(opportunityId: string, excludeProfileId?: string): Promise<RecommendedPartner[]> {
  const supabase = await createClient();
  const { data: opp } = await supabase
    .from("opportunities")
    .select("naics_code, place_state, tags")
    .eq("id", opportunityId)
    .maybeSingle();
  if (!opp) return [];

  const { data: interests, error } = await supabase
    .from("teaming_interests")
    .select("profile_id, role_type, naics_codes, locations, certifications")
    .eq("active", true)
    .limit(200);
  if (error) throw error;

  // teaming_interests' RLS lets anyone read active rows, but the profiles
  // they belong to are each owner-only under normal RLS -- teaming_profiles
  // (20260921001000) is the same network_members-style view workaround,
  // exposing just the fields real capability matching needs.
  const profileIds = (interests ?? []).map((r) => r.profile_id);
  const { data: profileRows } = await supabase.from("teaming_profiles").select("*").in("id", profileIds);
  const profilesById = new Map((profileRows ?? []).map((p) => [p.id, p]));

  const byProfile = new Map<string, RecommendedPartner>();
  for (const row of interests ?? []) {
    if (excludeProfileId && row.profile_id === excludeProfileId) continue;
    const profile = profilesById.get(row.profile_id);
    if (!profile) continue;

    const reasons: string[] = [];
    let score = 0;
    const naicsPool = new Set([...(row.naics_codes ?? []), ...(profile.naics_interests ?? [])]);
    if (opp.naics_code && naicsPool.has(opp.naics_code)) {
      score += 3;
      reasons.push(`Matches NAICS ${opp.naics_code}`);
    }
    if (opp.place_state && (row.locations ?? []).some((l) => l.toUpperCase().includes(opp.place_state!.toUpperCase()))) {
      score += 2;
      reasons.push(`Located in ${opp.place_state}`);
    }
    const capabilityOverlap = (row.certifications ?? []).filter((c) => (opp.tags ?? []).some((t) => t.toLowerCase().includes(c.toLowerCase())));
    if (capabilityOverlap.length > 0) {
      score += capabilityOverlap.length;
      reasons.push(`Certified: ${capabilityOverlap.join(", ")}`);
    }
    if (score === 0) continue;

    const existing = byProfile.get(row.profile_id);
    const partner: RecommendedPartner = {
      profileId: row.profile_id,
      name: `${profile.first_name} ${profile.last_name}`.trim(),
      companyName: profile.company_name,
      avatarUrl: profile.avatar_url,
      roleTypes: [...(existing?.roleTypes ?? []), row.role_type],
      matchReasons: [...(existing?.matchReasons ?? []), ...reasons],
      score: (existing?.score ?? 0) + score,
    };
    byProfile.set(row.profile_id, partner);
  }

  return Array.from(byProfile.values())
    .sort((a, b) => b.score - a.score)
    .slice(0, 5);
}

// Bid Tracker stages (20261001000900) — see src/lib/bid-tracker-plan.ts.
export type { TrackingStage };

export interface BidStage {
  id: string;
  label: string;
  color: string;
  sortOrder: number;
}

export interface TrackingTask {
  id: string;
  title: string;
  dueAt: string | null;
  done: boolean;
}

export interface BidShareRecipient {
  profileId: string;
  name: string;
}

export interface TrackingItem {
  id: string;
  opportunityId: string;
  opportunityTitle: string;
  opportunityRoute: string;
  agency: string | null;
  stage: TrackingStage;
  customStageId: string | null;
  notes: string | null;
  tasks: TrackingTask[];
  createdAt: string;
  updatedAt: string;
  responseDeadline: string | null;
  // Bid tracker (20261001000200): stamped by the database from stage
  // changes — a bid counts only if logged before the response deadline.
  bidSubmittedAt: string | null;
  outcome: "won" | "lost" | null;
  // Pro: this bid's own reminder schedule (days before the deadline);
  // null falls back to the member's default.
  reminderDays: number[] | null;
  amendmentAlerts: boolean;
  sharedWith: BidShareRecipient[];
}

// A bid another member shared with the viewer — read-only.
export interface SharedBid extends TrackingItem {
  ownerName: string;
}

const TRACKING_SELECT =
  "id, profile_id, opportunity_id, stage, custom_stage_id, notes, created_at, updated_at, bid_submitted_at, outcome, reminder_days, amendment_alerts, opportunities(title, slug, response_deadline, agency), opportunity_tracking_tasks(id, title, due_at, done), opportunity_tracking_shares(profile_id)";

type TrackingRow = {
  id: string;
  profile_id: string;
  opportunity_id: string;
  stage: string;
  custom_stage_id: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
  bid_submitted_at: string | null;
  outcome: string | null;
  reminder_days: number[] | null;
  amendment_alerts: boolean;
  opportunities: { title: string; slug: string; response_deadline: string | null; agency: string | null } | null;
  opportunity_tracking_tasks: { id: string; title: string; due_at: string | null; done: boolean }[] | null;
  opportunity_tracking_shares: { profile_id: string }[] | null;
};

function mapTrackingRow(t: TrackingRow, names: Map<string, { name: string }>): TrackingItem {
  return {
    id: t.id,
    opportunityId: t.opportunity_id,
    opportunityTitle: t.opportunities?.title ?? "Opportunity",
    opportunityRoute: `opportunities/${t.opportunities?.slug ?? ""}`,
    agency: t.opportunities?.agency ?? null,
    stage: t.stage as TrackingStage,
    customStageId: t.custom_stage_id,
    notes: t.notes,
    tasks: (t.opportunity_tracking_tasks ?? []).map((task) => ({ id: task.id, title: task.title, dueAt: task.due_at, done: task.done })),
    createdAt: t.created_at,
    updatedAt: t.updated_at,
    responseDeadline: t.opportunities?.response_deadline ?? null,
    bidSubmittedAt: t.bid_submitted_at,
    outcome: (t.outcome as TrackingItem["outcome"]) ?? null,
    reminderDays: t.reminder_days,
    amendmentAlerts: t.amendment_alerts,
    sharedWith: (t.opportunity_tracking_shares ?? []).map((s) => ({
      profileId: s.profile_id,
      name: names.get(s.profile_id)?.name || "GovConUnited Member",
    })),
  };
}

// The member's own Bid Tracker. Open to every member since 20261001000900;
// the Free/Pro split is enforced by opportunity_tracking_plan_guard.
export async function getOpportunityTracking(profileId: string): Promise<TrackingItem[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("opportunity_tracking")
    .select(TRACKING_SELECT)
    .eq("profile_id", profileId)
    .order("updated_at", { ascending: false });
  if (error) throw error;

  const rows = (data ?? []) as unknown as TrackingRow[];
  const names = await getAuthorMap(
    supabase,
    rows.flatMap((r) => (r.opportunity_tracking_shares ?? []).map((s) => s.profile_id)),
  );
  return rows.map((t) => mapTrackingRow(t, names));
}

// Bids other members shared with the viewer (bid_share RPC), read-only.
// The owner's custom stage labels aren't readable under RLS, so a bid in
// one of them shows as "In progress".
export async function getSharedBids(profileId: string): Promise<SharedBid[]> {
  const supabase = await createClient();
  const { data: shares, error: sharesError } = await supabase
    .from("opportunity_tracking_shares")
    .select("tracking_id")
    .eq("profile_id", profileId);
  if (sharesError) throw sharesError;
  const ids = (shares ?? []).map((s) => s.tracking_id);
  if (ids.length === 0) return [];

  const { data, error } = await supabase
    .from("opportunity_tracking")
    .select(TRACKING_SELECT)
    .in("id", ids)
    .order("updated_at", { ascending: false });
  if (error) throw error;

  const rows = (data ?? []) as unknown as TrackingRow[];
  const names = await getAuthorMap(supabase, rows.map((r) => r.profile_id));
  return rows.map((t) => ({
    ...mapTrackingRow(t, new Map()),
    sharedWith: [],
    ownerName: names.get(t.profile_id)?.name || "GovConUnited Member",
  }));
}

export interface BidTrackerSettings {
  stages: BidStage[];
  reminderDays: number[];
}

export async function getBidTrackerSettings(profileId: string): Promise<BidTrackerSettings> {
  const supabase = await createClient();
  const [{ data: stages, error }, { data: settings }] = await Promise.all([
    supabase
      .from("bid_tracker_stages")
      .select("id, label, color, sort_order")
      .eq("profile_id", profileId)
      .order("sort_order")
      .order("created_at"),
    supabase.from("bid_tracker_settings").select("reminder_days").eq("profile_id", profileId).maybeSingle(),
  ]);
  if (error) throw error;
  return {
    stages: (stages ?? []).map((s) => ({ id: s.id, label: s.label, color: s.color, sortOrder: s.sort_order })),
    reminderDays: settings?.reminder_days ?? [3, 1],
  };
}

export async function getOpportunityTrackingStage(profileId: string, opportunityId: string): Promise<TrackingStage | null> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("opportunity_tracking")
    .select("stage")
    .eq("profile_id", profileId)
    .eq("opportunity_id", opportunityId)
    .maybeSingle();
  return (data?.stage as TrackingStage) ?? null;
}

export interface TeamingInterestItem {
  roleType: string;
  naicsCodes: string[];
  locations: string[];
  certifications: string[];
  notes: string | null;
}

export async function getMyTeamingInterests(profileId: string): Promise<TeamingInterestItem[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("teaming_interests")
    .select("role_type, naics_codes, locations, certifications, notes")
    .eq("profile_id", profileId)
    .eq("active", true);
  if (error) throw error;
  return (data ?? []).map((r) => ({
    roleType: r.role_type,
    naicsCodes: r.naics_codes,
    locations: r.locations,
    certifications: r.certifications,
    notes: r.notes,
  }));
}

export interface TeamingInquiryItem {
  id: string;
  opportunityTitle: string | null;
  opportunityRoute: string | null;
  counterpartyId: string;
  counterpartyName: string;
  requestedRole: string;
  message: string;
  replyMessage: string | null;
  status: string;
  createdAt: string;
}

// profiles' own RLS only lets a member read their own row ("Users can view
// own profile"), so an embedded profiles!fkey(...) join silently comes
// back null for a counterparty who isn't you -- name lookups for another
// member go through the network_members view instead (a plain view over
// profiles owned by a role that can read every row, the same mechanism
// getNetworkMembers() already relies on for the directory).
async function namesByProfileId(
  supabase: Awaited<ReturnType<typeof createClient>>,
  ids: string[],
): Promise<Map<string, string>> {
  if (ids.length === 0) return new Map();
  const { data } = await supabase.from("network_members").select("id, first_name, last_name").in("id", ids);
  return new Map((data ?? []).filter((m): m is typeof m & { id: string } => m.id != null).map((m) => [m.id, `${m.first_name} ${m.last_name}`.trim()]));
}

export async function getReceivedTeamingInquiries(profileId: string): Promise<TeamingInquiryItem[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("teaming_inquiries")
    .select("id, requested_role, message, reply_message, status, created_at, sender_profile_id, opportunities(title, slug)")
    .eq("recipient_profile_id", profileId)
    .order("created_at", { ascending: false });
  if (error) throw error;

  const names = await namesByProfileId(supabase, (data ?? []).map((r) => r.sender_profile_id));
  return (data ?? []).map((r) => ({
    id: r.id,
    opportunityTitle: r.opportunities?.title ?? null,
    opportunityRoute: r.opportunities ? `opportunities/${r.opportunities.slug}` : null,
    counterpartyId: r.sender_profile_id,
    counterpartyName: names.get(r.sender_profile_id) ?? "A member",
    requestedRole: r.requested_role,
    message: r.message,
    replyMessage: r.reply_message,
    status: r.status,
    createdAt: r.created_at,
  }));
}

export async function getSentTeamingInquiries(profileId: string): Promise<TeamingInquiryItem[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("teaming_inquiries")
    .select("id, requested_role, message, reply_message, status, created_at, recipient_profile_id, opportunities(title, slug)")
    .eq("sender_profile_id", profileId)
    .order("created_at", { ascending: false });
  if (error) throw error;

  const names = await namesByProfileId(supabase, (data ?? []).map((r) => r.recipient_profile_id));
  return (data ?? []).map((r) => ({
    id: r.id,
    opportunityTitle: r.opportunities?.title ?? null,
    opportunityRoute: r.opportunities ? `opportunities/${r.opportunities.slug}` : null,
    counterpartyId: r.recipient_profile_id,
    counterpartyName: names.get(r.recipient_profile_id) ?? "A member",
    requestedRole: r.requested_role,
    message: r.message,
    replyMessage: r.reply_message,
    status: r.status,
    createdAt: r.created_at,
  }));
}

export async function getOpportunityNote(profileId: string, opportunityId: string): Promise<string> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("opportunity_notes")
    .select("body")
    .eq("profile_id", profileId)
    .eq("opportunity_id", opportunityId)
    .maybeSingle();
  return data?.body ?? "";
}

// Real, persisted follow/registration/save state — replaces the previous
// localStorage-only "gcuFollowedCompanies"/"gcuEventRegistrations"/
// "gcuSavedDiscussions" sets (company_follows/event_registrations/
// discussion_saves, 20260918020000_social_engagement.sql).
export async function getCompanyFollowIds(profileId: string): Promise<Set<string>> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("company_follows")
    .select("company_id")
    .eq("profile_id", profileId);
  if (error) throw error;
  return new Set((data ?? []).map((r) => r.company_id));
}

export async function getProfileFollowIds(followerId: string): Promise<Set<string>> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("profile_follows")
    .select("followed_id")
    .eq("follower_id", followerId);
  if (error) throw error;
  return new Set((data ?? []).map((r) => r.followed_id));
}

// Resolves profile ids to member cards in the order given, dropping any id
// network_members doesn't return (unconfirmed/deleted accounts).
async function membersFromIds(
  supabase: Awaited<ReturnType<typeof createClient>>,
  ids: string[],
): Promise<NetworkMember[]> {
  const authorMap = await getAuthorMap(supabase, ids);
  const seen = new Set<string>();
  const members: NetworkMember[] = [];
  for (const id of ids) {
    const info = authorMap.get(id);
    if (!info || seen.has(id)) continue;
    seen.add(id);
    const name = info.name || "GovConUnited Member";
    members.push({
      id,
      name,
      initials: initialsFromName(name),
      avatarUrl: info.avatarUrl,
      isPro: info.isPro,
      headline: info.headline,
      jobTitle: info.jobTitle,
      companyName: info.companyName,
    });
  }
  return members;
}

export interface CompanyFollowersSummary {
  count: number;
  // Newest first. Empty for signed-out visitors — the list itself is
  // signed-in only (company_followers RPC); the count is public.
  followers: NetworkMember[];
  // The viewer's own accepted connections who follow this company.
  connectionFollowers: NetworkMember[];
}

// Real followers for a company profile, via security-definer RPCs because
// company_follows is owner-only under RLS (see
// 20260927000200_followers_and_network_activity_notifications.sql).
export async function getCompanyFollowers(
  companyId: string,
  viewerId: string | null,
): Promise<CompanyFollowersSummary> {
  const supabase = await createClient();
  const { data: count, error: countError } = await supabase.rpc(
    "company_follower_count",
    { target_company_id: companyId },
  );
  if (countError) {
    console.error("getCompanyFollowers: count RPC failed:", countError.message);
    return { count: 0, followers: [], connectionFollowers: [] };
  }
  if (!viewerId)
    return { count: count ?? 0, followers: [], connectionFollowers: [] };

  const [{ data: rows, error }, connectionIds] = await Promise.all([
    supabase.rpc("company_followers", { target_company_id: companyId }),
    getConnectionIds(viewerId),
  ]);
  if (error) {
    console.error("getCompanyFollowers: list RPC failed:", error.message);
    return { count: count ?? 0, followers: [], connectionFollowers: [] };
  }
  const followers = await membersFromIds(
    supabase,
    (rows ?? []).map((r) => r.profile_id),
  );
  return {
    count: count ?? 0,
    followers,
    connectionFollowers: followers.filter((m) => connectionIds.has(m.id)),
  };
}

export interface ProfileNetworkSummary {
  // null when the member has hidden their connections from this viewer.
  connections: NetworkMember[] | null;
  // Ids (subset of `connections`) the viewer is also connected to.
  mutualIds: string[];
  // null when the member has hidden their network from this viewer.
  followers: NetworkMember[] | null;
  followingPeople: NetworkMember[];
  followingCompanyIds: string[];
}

// Real Connections / Followers / Following lists for a member profile.
export async function getProfileNetwork(
  profileId: string,
  viewerId: string | null,
  // False when the member turned off "Show my connection count and list" and
  // the viewer isn't them — connections and followers are then never loaded.
  networkVisible = true,
): Promise<ProfileNetworkSummary> {
  const supabase = await createClient();
  const [
    connectionRows,
    followerRows,
    followingRows,
    companyRows,
    viewerConnectionIds,
  ] = await Promise.all([
    viewerId && networkVisible
      ? supabase.rpc("profile_connection_ids", { target_profile_id: profileId })
      : Promise.resolve(null),
    networkVisible
      ? supabase
          .from("profile_follows")
          .select("follower_id, created_at")
          .eq("followed_id", profileId)
          .order("created_at", { ascending: false })
      : Promise.resolve(null),
    supabase
      .from("profile_follows")
      .select("followed_id, created_at")
      .eq("follower_id", profileId)
      .order("created_at", { ascending: false }),
    supabase.rpc("profile_followed_company_ids", {
      target_profile_id: profileId,
    }),
    viewerId && viewerId !== profileId
      ? getConnectionIds(viewerId)
      : Promise.resolve(new Set<string>()),
  ]);

  // Signed-out visitors never get the list (the RPC is authenticated-only);
  // a signed-in viewer gets an empty result both when there are none and
  // when the member hides connections, so the hidden case is decided by the
  // caller from profile.connectionsVisible, same as the hero's count line.
  const connectionIds = connectionRows?.data?.map((r) => r.profile_id) ?? null;
  const [connections, followers, followingPeople] = await Promise.all([
    connectionIds
      ? membersFromIds(supabase, connectionIds)
      : Promise.resolve(null),
    followerRows
      ? membersFromIds(
          supabase,
          (followerRows.data ?? []).map((r) => r.follower_id),
        )
      : Promise.resolve(null),
    membersFromIds(
      supabase,
      (followingRows.data ?? []).map((r) => r.followed_id),
    ),
  ]);

  return {
    connections,
    mutualIds: (connections ?? [])
      .filter((m) => viewerConnectionIds.has(m.id))
      .map((m) => m.id),
    followers,
    followingPeople,
    followingCompanyIds: (companyRows.data ?? []).map((r) => r.company_id),
  };
}

export async function getEventRegistrationIds(profileId: string): Promise<Set<string>> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("event_registrations")
    .select("event_id")
    .eq("profile_id", profileId);
  if (error) throw error;
  return new Set((data ?? []).map((r) => r.event_id));
}

// Same rows as getEventRegistrationIds, but keyed to the viewer's own
// pending/approved/declined status per event — needed anywhere the UI has
// to show "Pending Approval" as distinct from a confirmed "Registered"
// (see 20260922020000_event_attendee_approval.sql).
export async function getEventRegistrationStatuses(profileId: string): Promise<Map<string, EventRegistrationStatus>> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("event_registrations")
    .select("event_id, status")
    .eq("profile_id", profileId);
  if (error) throw error;
  return new Map((data ?? []).map((r) => [r.event_id, r.status as EventRegistrationStatus]));
}

// Real total across every "saved"-style table — replaces the old
// localStorage-only "gcuSavedOpportunities" count that only ever reflected
// one entity type and reset per-browser.
export async function getSavedCount(profileId: string): Promise<number> {
  const supabase = await createClient();
  const tables = ["job_saves", "opportunity_tracking", "company_follows", "event_registrations", "discussion_saves", "resource_saves", "person_saves", "saved_searches"] as const;
  const counts = await Promise.all(
    tables.map((table) => supabase.from(table).select("id", { count: "exact", head: true }).eq("profile_id", profileId)),
  );
  return counts.reduce((sum, c) => sum + (c.count ?? 0), 0);
}

export async function getPersonSaveIds(profileId: string): Promise<Set<string>> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("person_saves")
    .select("saved_profile_id")
    .eq("profile_id", profileId);
  if (error) throw error;
  return new Set((data ?? []).map((r) => r.saved_profile_id));
}

export async function getResourceSaveIds(profileId: string): Promise<Set<string>> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("resource_saves")
    .select("resource_id")
    .eq("profile_id", profileId);
  if (error) throw error;
  return new Set((data ?? []).map((r) => r.resource_id));
}

export async function getDiscussionSaveIds(profileId: string): Promise<Set<string>> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("discussion_saves")
    .select("post_id")
    .eq("profile_id", profileId);
  if (error) throw error;
  return new Set((data ?? []).map((r) => r.post_id));
}

export interface SavedComment {
  id: string;
  body: string;
  author: string;
  route: string;
  postTitle: string;
}

// Comments the viewer saved from a community discussion's comment menu,
// newest save first, each linking straight to the comment in its thread.
export async function getSavedComments(profileId: string): Promise<SavedComment[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("comment_saves")
    .select("created_at, post_comments(id, body, author_profile_id, image_url, video_url, posts!post_comments_post_id_fkey(slug, title))")
    .eq("profile_id", profileId)
    .order("created_at", { ascending: false });
  if (error) throw error;

  const rows = (data ?? []).flatMap((r) => (r.post_comments ? [r.post_comments] : []));
  const authorMap = await getAuthorMap(supabase, rows.map((c) => c.author_profile_id));
  return rows.flatMap((c) =>
    c.posts
      ? [
          {
            id: c.id,
            body: c.body || (c.video_url ? "Video" : c.image_url ? "Image" : ""),
            author: authorMap.get(c.author_profile_id)?.name || "GovConUnited Member",
            route: `community/discussion/${c.posts.slug}?comment=${c.id}`,
            postTitle: c.posts.title,
          },
        ]
      : [],
  );
}

// Same shape as getDiscussionSaveIds — which communities the viewer has
// starred in the sidebar's joined-communities list.
export async function getCommunityFavoriteIds(profileId: string): Promise<Set<string>> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("community_favorites")
    .select("community_id")
    .eq("profile_id", profileId);
  if (error) throw error;
  return new Set((data ?? []).map((r) => r.community_id));
}

export async function getPostFollowIds(profileId: string): Promise<Set<string>> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("post_follows")
    .select("post_id")
    .eq("profile_id", profileId);
  if (error) throw error;
  return new Set((data ?? []).map((r) => r.post_id));
}

// New conversations started this month — backs the Free plan's
// direct_messages_per_month cap (see src/lib/entitlements.ts). Only counts
// conversations THIS profile created (conversations.created_by), not ones
// where they're just the recipient — replying within an existing thread,
// or being messaged first, never counts against the cap.
export async function getDirectMessageStartCountThisMonth(profileId: string): Promise<number> {
  const supabase = await createClient();
  const monthStart = new Date();
  monthStart.setUTCDate(1);
  monthStart.setUTCHours(0, 0, 0, 0);
  const { count, error } = await supabase
    .from("conversations")
    .select("id", { count: "exact", head: true })
    .eq("created_by", profileId)
    .gte("created_at", monthStart.toISOString());
  if (error) throw error;
  return count ?? 0;
}

// Backs the Free/Pro company_pages cap (see src/lib/entitlements.ts) —
// counts every company this profile has submitted regardless of status
// (pending_review/draft/published), since a rejected submission (status
// reset to 'draft' — see rejectCompanySubmissionAction) still occupies
// their one company-page slot until they edit and resubmit that same row.
export async function getCompanyPageCountByOwner(profileId: string): Promise<number> {
  const supabase = await createClient();
  const { count, error } = await supabase
    .from("companies")
    .select("id", { count: "exact", head: true })
    .eq("submitted_by", profileId)
    // Rejected submissions (draft) and archived companies don't use up a
    // company page slot.
    .in("status", ["pending_review", "published"]);
  if (error) throw error;
  return count ?? 0;
}

export interface SavedSearch {
  id: string;
  name: string;
  filters: Record<string, string>;
  scope: "opportunities" | "jobs" | "companies";
  alertFrequency: "instant" | "daily" | "weekly" | "off";
  alertChannel: "in_app" | "email" | "both";
  enabled: boolean;
  createdAt: string;
}

// Real "Save Search" entries — replaces the mockup's 3 hardcoded demo rows.
// `scope` filters to one page's own searches (Opportunities vs Jobs); the
// Saved page's combined "Searches" tab omits it to show both.
export async function getSavedSearches(profileId: string, scope?: SavedSearch["scope"]): Promise<SavedSearch[]> {
  const supabase = await createClient();
  let query = supabase
    .from("saved_searches")
    .select("id, name, filters, scope, alert_frequency, alert_channel, enabled, created_at")
    .eq("profile_id", profileId)
    .order("created_at", { ascending: false });
  if (scope) query = query.eq("scope", scope);
  const { data, error } = await query;
  if (error) throw error;
  return (data ?? []).map((s) => ({
    id: s.id,
    name: s.name,
    filters: (s.filters as Record<string, string>) ?? {},
    scope: s.scope as SavedSearch["scope"],
    alertFrequency: s.alert_frequency as SavedSearch["alertFrequency"],
    alertChannel: s.alert_channel as SavedSearch["alertChannel"],
    enabled: s.enabled,
    createdAt: s.created_at,
  }));
}

export async function getSavedSearchCount(profileId: string): Promise<number> {
  const supabase = await createClient();
  const { count, error } = await supabase
    .from("saved_searches")
    .select("id", { count: "exact", head: true })
    .eq("profile_id", profileId);
  if (error) throw error;
  return count ?? 0;
}

// Recent searches (search_history) — a distinct feature from saved_searches
// above (a named filter preset for opportunities); this is a lightweight,
// per-member log of literal queries typed into global search.
export async function getSearchHistory(profileId: string, limit = 8): Promise<string[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("search_history")
    .select("query")
    .eq("profile_id", profileId)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw error;
  return (data ?? []).map((r) => r.query);
}
