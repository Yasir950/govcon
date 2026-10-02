"use client";

import Link from "next/link";
import { CompanyLogo } from "@/components/companies/CompanyLogo";
import { CompanyLink } from "@/components/companies/CompanyLink";
import { LocationAutocomplete } from "@/components/LocationAutocomplete";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  featureHighlights,
  freePlanFeatures,
  proPlanFeatures,
  quickSearchTerms,
  type Community,
  type Company,
  type EventItem,
  type Job,
  type JobCategory,
  type Member,
  type NetworkMember,
  type Opportunity,
  type Post,
  type Resource,
  type Testimonial,
} from "@/lib/landing-data";
import type {
  ActiveNotice,
  ConnectionState,
  Partner,
  PlatformMetric,
  SiteSettings,
} from "@/lib/supabase/queries";
import type { Viewer } from "@/lib/supabase/viewer";
import { joinCommunityAction, leaveCommunityAction } from "@/app/(app)/communities/actions";
import { toggleCompanyFollowAction } from "@/app/companies/actions";
import { toggleEventRegistrationAction } from "@/app/(app)/events/actions";
import { toggleJobSaveAction } from "@/app/(app)/jobs/actions";
import {
  removeConnectionAction,
  sendConnectionRequestAction,
} from "@/app/(app)/network/actions";
import { toggleOpportunityTrackAction } from "@/app/(app)/opportunities/tracking/actions";
import { BidLimitPrompt } from "@/components/opportunities/BidLimitPrompt";
import { toneFor } from "@/lib/avatar-tone";
import { companyCardOverview } from "@/lib/company-overview";
import { ProBadge } from "@/components/pro-badge";
import { VerifiedBadge } from "@/components/verified-badge";
import { useRequireAuth } from "@/lib/landing-hooks";
import { useToast } from "@/components/toast-provider";
import { ChatbotLoader } from "@/components/chatbot-loader";
import { SiteHeader } from "@/components/landing/SiteHeader";
import { SiteFooter } from "@/components/landing/SiteFooter";
import { NoticeBanner } from "@/components/landing/NoticeBanner";
import { FeatureIconGlyph } from "@/components/landing/feature-icon";
import { AnimatedMetric } from "@/components/landing/AnimatedMetric";

export interface LandingPageProps {
  opportunities: Opportunity[];
  companies: Company[];
  jobs: Job[];
  jobCategories: JobCategory[];
  members: Member[];
  networkMembers: NetworkMember[];
  events: EventItem[];
  posts: Post[];
  testimonials: Testimonial[];
  metrics: PlatformMetric[];
  resources: Resource[];
  partners: Partner[];
  communities: Community[];
  siteSettings: SiteSettings;
  activeNotice: ActiveNotice | null;
  viewer: Viewer | null;
  votedPostIds: Set<string>;
  savedOpportunityIds: string[];
  savedJobIds: string[];
  connectionStates: Record<string, ConnectionState>;
  followedCompanyIds: string[];
  registeredEventIds: string[];
  savedDiscussionIds: string[];
  myCommunityIds: string[];
}

export default function LandingPage({
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
  siteSettings,
  activeNotice,
  viewer,
  votedPostIds,
  savedOpportunityIds,
  savedJobIds,
  connectionStates,
  followedCompanyIds,
  registeredEventIds,
  savedDiscussionIds,
  myCommunityIds,
}: LandingPageProps) {
  const router = useRouter();
  const showToast = useToast();
  const requireAuth = useRequireAuth(viewer);

  const [savedOpportunities, setSavedOpportunities] = useState(
    () => new Set(savedOpportunityIds),
  );
  const [savedJobs, setSavedJobs] = useState(() => new Set(savedJobIds));
  const [bidLimit, setBidLimit] = useState<number | null>(null);
  const [connections, setConnections] = useState<Map<string, ConnectionState>>(
    () => new Map(Object.entries(connectionStates)),
  );
  const [followedCompanies, setFollowedCompanies] = useState(
    () => new Set(followedCompanyIds),
  );
  const [eventRegistrations, setEventRegistrations] = useState(
    () => new Set(registeredEventIds),
  );
  const [joinedCommunityIds, setJoinedCommunityIds] = useState(() => new Set(myCommunityIds));

  async function toggleJoinCommunity(community: Community) {
    const joined = joinedCommunityIds.has(community.id);
    setJoinedCommunityIds((prev) => {
      const next = new Set(prev);
      if (joined) next.delete(community.id);
      else next.add(community.id);
      return next;
    });
    const result = joined ? await leaveCommunityAction(community.id) : await joinCommunityAction(community.id);
    if (result.error) {
      showToast(result.error);
      setJoinedCommunityIds((prev) => {
        const next = new Set(prev);
        if (joined) next.add(community.id);
        else next.delete(community.id);
        return next;
      });
      return;
    }
    showToast(joined ? `Left ${community.name}` : `Joined ${community.name}`);
  }

  // Member-created "Event" posts, upcoming only — `posts` already includes
  // every published post platform-wide, so no extra query is needed here.
  // Matches hasEventEnded() in queries.ts (used by the Events page and the
  // dashboard's Upcoming Events widget): an explicit end time is judged by
  // that, otherwise a post stays listed for 24h after its start rather than
  // vanishing the instant it begins. Duplicated here (not imported) since
  // this file is client-only and that helper isn't exported.
  const communityEvents = useMemo(
    () =>
      posts
        .filter((p) => {
          if (p.postType !== "event" || !p.eventStartsAt) return false;
          if (p.eventEndsAt) return new Date(p.eventEndsAt).getTime() >= Date.now();
          return new Date(p.eventStartsAt).getTime() + 24 * 60 * 60 * 1000 >= Date.now();
        })
        .sort((a, b) => new Date(a.eventStartsAt!).getTime() - new Date(b.eventStartsAt!).getTime())
        .slice(0, 4),
    [posts],
  );

  async function toggleSavedOpportunity(o: Opportunity) {
    const result = await toggleOpportunityTrackAction(o.id);
    if (result.error) {
      if (result.limitReached) setBidLimit(result.limitReached);
      else showToast(result.error);
      return;
    }
    setSavedOpportunities((prev) => {
      const next = new Set(prev);
      if (result.active) next.add(o.id);
      else next.delete(o.id);
      return next;
    });
    showToast(result.active ? "Added to your Bid Tracker as Interested" : "Removed from your Bid Tracker");
  }

  async function toggleSavedJob(j: Job) {
    const result = await toggleJobSaveAction(j.id);
    if (result.error) {
      showToast(result.error);
      return;
    }
    setSavedJobs((prev) => {
      const next = new Set(prev);
      if (result.active) next.add(j.id);
      else next.delete(j.id);
      return next;
    });
    showToast(result.active ? "Job saved" : "Job removed from Saved");
  }

  async function toggleFollowedCompany(c: Company) {
    const result = await toggleCompanyFollowAction(c.id);
    if (result.error) {
      showToast(result.error);
      return;
    }
    setFollowedCompanies((prev) => {
      const next = new Set(prev);
      if (result.active) next.add(c.id);
      else next.delete(c.id);
      return next;
    });
    showToast(
      result.active ? `Now following ${c.name}` : `Unfollowed ${c.name}`,
    );
  }

  async function toggleEventRegistration(ev: EventItem) {
    const result = await toggleEventRegistrationAction(ev.dbId);
    if (result.error) {
      showToast(result.error);
      return;
    }
    setEventRegistrations((prev) => {
      const next = new Set(prev);
      if (result.active) next.add(ev.dbId);
      else next.delete(ev.dbId);
      return next;
    });
    showToast(
      result.active
        ? `You are registered for ${ev.title}`
        : "Registration canceled",
    );
  }

  async function toggleConnection(m: NetworkMember) {
    const state = connections.get(m.id) ?? null;
    if (state && state.status === "pending" && !state.requestedByMe) {
      router.push(`/network/${m.id}`);
      return;
    }
    if (!state) {
      const result = await sendConnectionRequestAction(m.id);
      if (result.error) {
        showToast(result.error);
        return;
      }
      setConnections((prev) =>
        new Map(prev).set(m.id, {
          connectionId: result.connectionId ?? "",
          status: "pending",
          requestedByMe: true,
        }),
      );
      showToast(`Connection request sent to ${m.name}`);
      return;
    }
    const wasAccepted = state.status === "accepted";
    const result = await removeConnectionAction(state.connectionId);
    if (result.error) {
      showToast(result.error);
      return;
    }
    setConnections((prev) => {
      const next = new Map(prev);
      next.delete(m.id);
      return next;
    });
    showToast(
      wasAccepted ? "Connection removed" : "Connection request canceled",
    );
  }

  const [searchQuery, setSearchQuery] = useState("");
  const [searchLocation, setSearchLocation] = useState("");
  const searchInputRef = useRef<HTMLInputElement | null>(null);

  // Searching from the hero card takes the visitor to the real, full
  // opportunities page (with the query pre-filled) rather than filtering
  // the few preview cards in place on the landing page. /opportunities has
  // no separate `location` URL param — its own text search already
  // matches against an opportunity's location among other fields (see
  // OpportunitiesPageClient's filter), so location is folded into the same
  // `q` string rather than introducing a second param nothing reads yet.
  const runSearch = useCallback(() => {
    const q = [searchQuery.trim(), searchLocation.trim()].filter(Boolean).join(" ");
    router.push(
      q ? `/opportunities?q=${encodeURIComponent(q)}` : "/opportunities",
    );
  }, [searchQuery, searchLocation, router]);

  const quickSearch = useCallback(
    (term: string) => {
      router.push(`/opportunities?q=${encodeURIComponent(term)}`);
    },
    [router],
  );

  const [billingCycle, setBillingCycle] = useState<"monthly" | "annual">(
    "monthly",
  );

  const [testimonialPage, setTestimonialPage] = useState(0);
  useEffect(() => {
    const timer = setInterval(
      () => setTestimonialPage((p) => (p + 1) % 2),
      7000,
    );
    return () => clearInterval(timer);
  }, [testimonialPage]);

  const carouselPartners = partners.filter((p) => p.placement === "carousel");
  const partnerPageCount = Math.max(1, Math.ceil(carouselPartners.length / 4));
  const [partnerPage, setPartnerPage] = useState(0);

  const proMonthly = 49;
  const proAnnual = 490;

  return (
    <>
      <NoticeBanner notice={activeNotice} />
      <SiteHeader viewer={viewer} />
      <main>
        <section className="hero">
          <div className="wrap hero-grid">
            <div>
              <div className="eyebrow">One community. More contracts.</div>
              <h1>
                Connect. Collaborate.
                <br />
                Win Government Work.
              </h1>
              <p>
                GovConUnited connects government contractors, subcontractors,
                consultants, suppliers, and GovCon professionals in one
                collaborative government contracting network. Teaming,
                subcontracting, and more — build strategic partnerships, find
                qualified subcontractors, connect with trusted industry
                professionals, discover government contracting opportunities,
                and grow your public-sector business through relationships built
                to compete and win together.
              </p>
              <div className="actions">
                <Link className="btn" href="/opportunities">
                  Find Opportunities
                </Link>
                <Link
                  className="btn brand-red"
                  href={viewer ? "/dashboard" : "/signup"}
                >
                  {viewer ? "Go to Home" : "Join GovConUnited Free"}
                </Link>
                {!viewer && (
                  <Link className="btn secondary" href="/login">
                    Log In
                  </Link>
                )}
              </div>
              <div className="metrics">
                {metrics.map((m) => (
                  <AnimatedMetric
                    key={m.label}
                    value={m.value}
                    label={m.label}
                  />
                ))}
              </div>
            </div>
            <div className="searchcard">
              <h2>Find your next opportunity</h2>
              <p>
                Search federal, state, local, teaming, and subcontracting work.
              </p>
              <div className="field">
                <span>
                  <svg
                    viewBox="0 0 24 24"
                    width="22"
                    height="22"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    aria-hidden="true"
                  >
                    <circle cx="11" cy="11" r="7" />
                    <path d="m20 20-4-4" />
                  </svg>
                </span>
                <input
                  ref={searchInputRef}
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && runSearch()}
                  placeholder="Keyword, company, NAICS code, or location"
                />
              </div>
              <div className="field" style={{ overflow: "visible" }}>
                <span>
                  <svg
                    viewBox="0 0 24 24"
                    width="22"
                    height="22"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    aria-hidden="true"
                  >
                    <path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0z" />
                    <circle cx="12" cy="10" r="3" />
                  </svg>
                </span>
                <LocationAutocomplete
                  className=""
                  value={searchLocation}
                  onChange={setSearchLocation}
                  placeholder="Nationwide"
                />
              </div>
              <button className="btn" onClick={runSearch}>
                Search Opportunities
              </button>
              <div className="quick">
                {quickSearchTerms.map((term) => (
                  <button
                    className="chip"
                    key={term}
                    onClick={() => quickSearch(term)}
                  >
                    {term}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </section>

        <section className="feature-strip" id="resources">
          <div className="wrap features">
            {featureHighlights.map((f) => (
              <article className="feature" key={f.title}>
                <div className="ficon">
                  <FeatureIconGlyph icon={f.icon} />
                </div>
                <h3>{f.title}</h3>
                <p>{f.description}</p>
                <a href={f.href}>{f.linkLabel} →</a>
              </article>
            ))}
          </div>
        </section>

        <section className="main" id="opportunities">
          <div className="wrap">
            <div className="section-head">
              <div>
                <h2>Opportunities For Teaming, Subcontracting, and More</h2>
                <p>
                  Fresh opportunities, timely events, and the people who can
                  help you win.
                </p>
              </div>
              <Link
                className="textlink"
                href={viewer ? "/dashboard" : "/login?next=/dashboard"}
              >
                View dashboard →
              </Link>
            </div>
            <div className="content-grid opportunity-grid">
              <section className="panel">
                <div className="panel-head">
                  <h3>Recent Opportunities</h3>
                  <Link className="textlink" href="/opportunities">
                    View all →
                  </Link>
                </div>
                {opportunities.length === 0 ? (
                  <p style={{ color: "var(--muted)" }}>No opportunities posted yet — check back soon.</p>
                ) : (
                  opportunities.slice(0, 5).map((o) => {
                    const saved = savedOpportunities.has(o.id);
                    return (
                      <article
                        className="opp"
                        tabIndex={0}
                        role="link"
                        key={o.route}
                        onClick={() => router.push(`/${o.route}`)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" || e.key === " ") {
                            e.preventDefault();
                            router.push(`/${o.route}`);
                          }
                        }}
                      >
                        <CompanyLogo name={o.company} initials={o.logo} logoUrl={o.logoUrl} className="company-logo" />
                        <div>
                          <h4>
                            <Link
                              href={`/${o.route}`}
                              onClick={(e) => e.stopPropagation()}
                            >
                              {o.title}
                            </Link>
                          </h4>
                          <p>
                            <CompanyLink slug={o.companySlug}>{o.company}</CompanyLink> · {o.location}
                          </p>
                          <div className="tags">
                            {o.tags.map((t) => (
                              <span className="tag" key={t}>
                                {t}
                              </span>
                            ))}
                          </div>
                        </div>
                        <button
                          className={`save${saved ? " saved" : ""}`}
                          aria-label={saved ? "Tracked in your Bid Tracker" : "Track in your Bid Tracker"}
                          title={saved ? "In your Bid Tracker" : "Track this bid"}
                          aria-pressed={saved}
                          onClick={(e) => {
                            e.stopPropagation();
                            requireAuth(() => toggleSavedOpportunity(o));
                          }}
                        >
                          {saved ? "♥" : "♡"}
                        </button>
                      </article>
                    );
                  })
                )}
              </section>
              <aside className="panel">
                <div className="cta">
                  <div className="eyebrow">GovConUnited Pro</div>
                  <h3>Stand out. Find matches. Move faster.</h3>
                  <p>
                    Upgrade to GovConUnited Pro and build credibility with a Pro
                    verification badge, priority visibility, advanced government
                    contracting opportunity filters, unlimited saved searches,
                    and powerful performance analytics.
                  </p>
                  <p>
                    Find federal, state, local, defense, and teaming and
                    subcontracting opportunities faster while connecting with
                    government contractors, subcontractors, suppliers,
                    consultants, and GovCon hiring companies through enhanced
                    messaging and professional networking tools.
                  </p>
                  <a className="btn" href="#pricing">
                    Explore Pro
                  </a>
                </div>
              </aside>
            </div>
          </div>
        </section>

        <section className="companies-section" id="companies">
          <div className="wrap">
            <div className="section-head">
              <div>
                <div className="eyebrow" style={{ color: "var(--blue)" }}>
                  Company directory
                </div>
                <h2>Companies building the public sector</h2>
                <p>
                  Discover government contractors, subcontractors, suppliers,
                  and consulting firms by capability, certification, and
                  location.
                </p>
              </div>
              <Link className="textlink" href="/companies">
                Browse all companies →
              </Link>
            </div>
            <div className="company-grid">
              {companies.length === 0 ? (
                <p style={{ color: "var(--muted)" }}>No companies listed yet — check back soon.</p>
              ) : (
                companies.map((c) => {
                  const following = followedCompanies.has(c.id);
                  return (
                    <article className="company-card" key={c.route}>
                      <Link href={`/${c.route}`}>
                        <div className="company-card-head">
                          <CompanyLogo name={c.name} initials={c.logo} logoUrl={c.logoUrl} className="company-logo" />
                          <div>
                            <h3>
                              {c.name}
                              {c.verified && <VerifiedBadge />}
                            </h3>
                            <p className="company-type">
                              {c.type} · {c.location}
                            </p>
                          </div>
                        </div>
                        <p>{companyCardOverview(c)}</p>
                        <div className="company-meta">
                          {c.tags.map((t) => (
                            <span className="tag" key={t}>
                              {t}
                            </span>
                          ))}
                        </div>
                      </Link>
                      <div className="company-actions">
                        <button
                          className={`follow-company${following ? " following" : ""}`}
                          onClick={() =>
                            requireAuth(() => toggleFollowedCompany(c))
                          }
                        >
                          {following ? "Following" : "Follow"}
                        </button>
                      </div>
                    </article>
                  );
                })
              )}
            </div>
          </div>
        </section>

        <section className="main" id="jobs" style={{ background: "#fff" }}>
          <div className="wrap">
            <div className="section-head">
              <div>
                <div className="eyebrow" style={{ color: "var(--blue)" }}>
                  GovCon careers
                </div>
                <h2>Jobs for government contracting professionals</h2>
                <p>
                  Explore roles posted by companies across capture, proposals,
                  contracts, operations, and technical delivery.
                </p>
              </div>
              <Link className="textlink" href="/jobs">
                View all jobs →
              </Link>
            </div>
            <div className="content-grid">
              <section className="panel">
                <div className="panel-head">
                  <h3>Recent Jobs</h3>
                  <Link className="textlink" href="/jobs">
                    View all →
                  </Link>
                </div>
                {jobs.length === 0 ? (
                  <p style={{ color: "var(--muted)" }}>No jobs posted yet — check back soon.</p>
                ) : (
                  jobs.slice(0, 4).map((j) => {
                    const saved = savedJobs.has(j.id);
                    return (
                      <article
                        className="opp job-card"
                        tabIndex={0}
                        role="link"
                        key={j.route}
                        onClick={() => router.push(`/${j.route}`)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" || e.key === " ") {
                            e.preventDefault();
                            router.push(`/${j.route}`);
                          }
                        }}
                      >
                        <CompanyLogo name={j.company} initials={j.logo} logoUrl={j.logoUrl} className="company-logo" />
                        <div>
                          <h4>
                            <Link
                              href={`/${j.route}`}
                              onClick={(e) => e.stopPropagation()}
                            >
                              {j.title}
                            </Link>
                          </h4>
                          <p>
                            <CompanyLink slug={j.companySlug}>{j.company}</CompanyLink> · {j.location}
                          </p>
                          <div className="tags">
                            {j.tags.map((t) => (
                              <span className="tag" key={t}>
                                {t}
                              </span>
                            ))}
                          </div>
                        </div>
                        <button
                          className={`save${saved ? " saved" : ""}`}
                          aria-label="Save job"
                          aria-pressed={saved}
                          onClick={(e) => {
                            e.stopPropagation();
                            requireAuth(() => toggleSavedJob(j));
                          }}
                        >
                          {saved ? "♥" : "♡"}
                        </button>
                      </article>
                    );
                  })
                )}
              </section>
              <section className="panel" style={{ alignSelf: "start" }}>
                <div className="panel-head">
                  <h3>Popular Job Categories</h3>
                  <Link className="textlink" href="/jobs">
                    Browse all →
                  </Link>
                </div>
                {jobCategories.map((cat) => (
                  <article className="event" key={cat.title}>
                    <div className="event-date">
                      <span>
                        {cat.count}
                        <small>JOBS</small>
                      </span>
                    </div>
                    <div>
                      <h4>{cat.title}</h4>
                      <p>{cat.description}</p>
                    </div>
                  </article>
                ))}
              </section>
              <aside className="panel">
                <div className="cta">
                  <div className="eyebrow">Advance your career</div>
                  <h3>Find your next GovCon role.</h3>
                  <p>
                    Create a professional government contracting profile that
                    highlights your GovCon experience, security clearances,
                    certifications, technical skills, and career goals for
                    federal contractors and hiring companies.
                  </p>
                  <p>
                    Set your job preferences, discover government contracting
                    jobs that match your expertise, and connect directly with
                    employers hiring for federal, state, local, defense, and
                    public-sector contract roles.
                  </p>
                  <Link
                    className="btn"
                    href={viewer ? "/dashboard" : "/signup?next=%2Fdashboard"}
                  >
                    Set Job Preferences
                  </Link>
                </div>
              </aside>
            </div>
          </div>
        </section>

        <section className="network-section" id="network">
          <div className="wrap">
            <div className="section-head">
              <div>
                <div className="eyebrow" style={{ color: "var(--blue)" }}>
                  Build relationships
                </div>
                <h2>People you may want to connect with</h2>
                <p>
                  Potential connections based on your GovCon interests,
                  industry, location, and mutual relationships.
                </p>
              </div>
              <Link className="textlink" href="/network">
                View all connections →
              </Link>
            </div>
            {networkMembers.length === 0 ? (
              <p style={{ color: "var(--muted)" }}>
                No GovConUnited members yet — be one of the first to join.
              </p>
            ) : (
              <div className="connections-grid">
                {networkMembers.slice(0, 8).map((m) => {
                  const state = connections.get(m.id) ?? null;
                  const label =
                    state?.status === "accepted"
                      ? "Connected"
                      : state?.status === "pending"
                        ? state.requestedByMe
                          ? "Request Sent"
                          : "Respond"
                        : "Connect";
                  return (
                    <article className="connection-card" key={m.id}>
                      <Link href={`/network/${m.id}`}>
                        {m.avatarUrl ? (
                          <img
                            src={m.avatarUrl}
                            alt={m.name}
                          />
                        ) : (
                          <span
                            className="initials-avatar"
                            data-tone={toneFor(m.name)}
                            role="img"
                            aria-label={m.name}
                          >
                            {m.initials}
                          </span>
                        )}
                        <h3>
                          {m.name}
                          {m.isPro && <ProBadge size={14} />}
                        </h3>
                        <p>{m.headline || `${m.jobTitle || "GovConUnited Member"}${m.companyName ? ` at ${m.companyName}` : ""}`}</p>
                      </Link>
                      <button
                        className={`connect-btn${state ? " connected" : ""}`}
                        onClick={() => requireAuth(() => toggleConnection(m))}
                      >
                        {label === "Connect" ? "Connect+" : label}
                      </button>
                    </article>
                  );
                })}
              </div>
            )}
          </div>
        </section>

        <section className="events-section" id="events">
          <div className="wrap">
            <div className="section-head">
              <div>
                <div className="eyebrow" style={{ color: "var(--blue)" }}>
                  Learn and connect
                </div>
                <h2>Upcoming GovCon events</h2>
                <p>
                  Join webinars, conferences, Q&amp;A sessions, and teaming
                  events built for the government contracting community.
                </p>
              </div>
              <Link className="textlink" href="/events">
                View all events →
              </Link>
            </div>
            <div className="events-grid">
              {events.length === 0 ? (
                <p style={{ color: "var(--muted)" }}>No events scheduled yet — check back soon.</p>
              ) : (
                events.map((ev) => {
                  const registered = eventRegistrations.has(ev.dbId);
                  return (
                    <article
                      className="event-card"
                      tabIndex={0}
                      role="link"
                      key={ev.id}
                      onClick={() => router.push(`/events/${ev.id}`)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                          router.push(`/events/${ev.id}`);
                        }
                      }}
                    >
                      <div className="event-card-top">
                        <div className="event-date">
                          <span>
                            <small>{ev.month}</small>
                            {ev.day}
                          </span>
                        </div>
                        <span className="verify" style={{ color: "#d7e7ff" }}>
                          {ev.kind}
                        </span>
                      </div>
                      <div className="event-card-body">
                        <h3>
                          <Link
                            href={`/events/${ev.id}`}
                            onClick={(e) => e.stopPropagation()}
                          >
                            {ev.title}
                          </Link>
                        </h3>
                        <p>{ev.when}</p>
                        <p>{ev.description}</p>
                        <button
                          className={`btn${registered ? " registered" : ""}`}
                          onClick={(e) => {
                            e.stopPropagation();
                            requireAuth(() => toggleEventRegistration(ev));
                          }}
                        >
                          {registered ? "Registered ✓" : ev.cta}
                        </button>
                      </div>
                    </article>
                  );
                })
              )}
            </div>

            {communityEvents.length > 0 && (
              <div style={{ marginTop: 28 }}>
                <h3 style={{ marginBottom: 12 }}>From the community</h3>
                <div className="events-grid">
                  {communityEvents.map((p) => (
                    <article className="event-card" key={p.id} style={{ cursor: "default" }}>
                      <div className="event-card-top">
                        <div className="event-date">
                          <span>
                            <small>{new Date(p.eventStartsAt!).toLocaleDateString("en-US", { month: "short" }).toUpperCase()}</small>
                            {new Date(p.eventStartsAt!).toLocaleDateString("en-US", { day: "2-digit" })}
                          </span>
                        </div>
                        <span className="verify" style={{ color: "#d7e7ff" }}>
                          Community Event
                        </span>
                      </div>
                      <div className="event-card-body">
                        <h3>{p.title}</h3>
                        <p>
                          {new Date(p.eventStartsAt!).toLocaleString()}
                          {p.eventLocation ? ` · ${p.eventLocation}` : ""}
                        </p>
                        <p>
                          By{" "}
                          {p.authorProfileId ? (
                            <Link href={`/network/${p.authorProfileId}`}>{p.author}</Link>
                          ) : (
                            p.author
                          )}
                        </p>
                      </div>
                    </article>
                  ))}
                </div>
              </div>
            )}
          </div>
        </section>

        <section className="community" id="community">
          <div className="wrap">
            <div className="section-head">
              <div>
                <h2>Find your GovCon community</h2>
                <p>Join focused groups for the topics and disciplines you work in — separate from your main feed.</p>
              </div>
              <div className="section-actions">
                <Link className="textlink" href="/community">
                  Browse the community →
                </Link>
              </div>
            </div>
            <div className="community-grid">
              <section className="panel" id="posts">
                {communities.length === 0 ? (
                  <p style={{ color: "var(--muted)", padding: "18px 20px" }}>No communities yet — check back soon.</p>
                ) : (
                  <>
                    {communities.slice(0, 5).map((c) => {
                      const joined = joinedCommunityIds.has(c.id);
                      return (
                        <article className="post" key={c.id} style={{ gridTemplateColumns: "1fr" }}>
                          <div>
                            <h4>
                              <Link href={`/communities/${c.slug}`}>{c.name}</Link>
                            </h4>
                            <p>{c.description}</p>
                            <div className="postlinks">
                              <span>{c.memberCount} member{c.memberCount === 1 ? "" : "s"}</span>
                              <span>{c.postCount} post{c.postCount === 1 ? "" : "s"}</span>
                              <button
                                className="post-action"
                                onClick={() => requireAuth(() => toggleJoinCommunity(c))}
                              >
                                {joined ? "Joined" : "Join"}
                              </button>
                            </div>
                          </div>
                        </article>
                      );
                    })}
                    {communities.length > 5 && (
                      <div style={{ padding: "16px 20px" }}>
                        <Link href="/community" className="btn btn-outline btn-full">
                          View All Communities →
                        </Link>
                      </div>
                    )}
                  </>
                )}
              </section>
              <aside className="panel">
                <div className="panel-head">
                  <h3>Top Members</h3>
                  <span className="verify">GovCon leaders</span>
                </div>
                {members.length === 0 ? (
                  <p style={{ color: "var(--muted)", padding: "0 20px 20px" }}>No top members yet.</p>
                ) : (
                members.map((m, i) => (
                  <Link className="member" href={`/network/${m.id}`} key={m.id}>
                    <span className="rank">{i + 1}</span>
                    {m.avatar ? (
                      <img className="member-avatar" src={m.avatar} alt={m.name} />
                    ) : (
                      <span
                        className="member-avatar"
                        data-tone={toneFor(m.name)}
                        style={{ display: "grid", placeItems: "center", background: "var(--navy)", color: "#fff", fontSize: 14, fontWeight: 400 }}
                      >
                        {m.name.split(" ").map((w) => w[0]).slice(0, 2).join("").toUpperCase() || "GC"}
                      </span>
                    )}
                    <span>
                      <b>
                        {m.name}
                        {m.verified && <VerifiedBadge />}
                      </b>
                      <small>{m.role}</small>
                    </span>
                    <span className="points">{m.cred.toLocaleString()} ▲</span>
                  </Link>
                ))
                )}
              </aside>
            </div>
          </div>
        </section>

        {testimonials.length > 0 && (
        <section className="testimonials" aria-labelledby="testimonial-title">
          <div className="wrap">
            <div className="section-head">
              <div>
                <div className="eyebrow">Member success stories</div>
                <h2 id="testimonial-title">
                  Trusted by professionals building the public sector
                </h2>
                <p>
                  Contractors and GovCon experts use GovConUnited to find
                  partners, strengthen proposals, and pursue the right work.
                </p>
              </div>
            </div>
            <div className="testimonial-window">
              <div
                className="testimonial-track"
                style={{ transform: `translateX(-${testimonialPage * 100}%)` }}
              >
                {[0, 1].map((page) => (
                  <div className="testimonial-slide" key={page}>
                    {testimonials.slice(page * 3, page * 3 + 3).map((t) => (
                      <article className="quote-card" key={t.name}>
                        <div className="stars" aria-label="5 out of 5 stars">
                          ★★★★★
                        </div>
                        <blockquote>&ldquo;{t.quote}&rdquo;</blockquote>
                        <div className="quote-person">
                          <span className="avatar">{t.initials}</span>
                          <span>
                            <b>
                              {t.name}
                              {t.verified && <VerifiedBadge />}
                            </b>
                            <small>{t.role}</small>
                          </span>
                        </div>
                      </article>
                    ))}
                  </div>
                ))}
              </div>
            </div>
            <div className="testimonial-controls">
              <button
                aria-label="Previous testimonials"
                onClick={() => setTestimonialPage((p) => (p + 1) % 2)}
              >
                ←
              </button>
              <div className="dots">
                {[0, 1].map((page) => (
                  <button
                    key={page}
                    className={`dot${testimonialPage === page ? " active" : ""}`}
                    aria-label={`Show testimonials ${page * 3 + 1} through ${page * 3 + 3}`}
                    onClick={() => setTestimonialPage(page)}
                  />
                ))}
              </div>
              <button
                aria-label="Next testimonials"
                onClick={() => setTestimonialPage((p) => (p + 1) % 2)}
              >
                →
              </button>
            </div>
          </div>
        </section>
        )}

        <section className="pricing" id="pricing">
          <div className="wrap">
            <div className="section-head">
              <div>
                <h2>Choose how you want to grow</h2>
                <p>
                  Start free. Upgrade when your GovCon pipeline needs more
                  power.
                </p>
              </div>
            </div>
            <div className="billing-toggle" aria-label="Billing frequency">
              <button
                className={billingCycle === "monthly" ? "active" : ""}
                onClick={() => {
                  setBillingCycle("monthly");
                  showToast("Monthly billing selected");
                }}
              >
                Monthly
              </button>
              <button
                className={billingCycle === "annual" ? "active" : ""}
                onClick={() => {
                  setBillingCycle("annual");
                  showToast("Annual billing selected — you save $98");
                }}
              >
                Annual
              </button>
              <span className="save-pill">Save $98</span>
            </div>
            <div className="pricegrid">
              <article className="price">
                <h3>GovConUnited Free</h3>
                <div className="cost">
                  $0 <small>forever</small>
                </div>
                <p className="price-note">&nbsp;</p>
                <p className="price-desc">
                  Build your presence, access your dashboard, and participate in
                  the government contracting community.
                </p>
                <div className="feature-group">
                  <h4>Free membership includes</h4>
                  <ul>
                    {freePlanFeatures.map((f) => (
                      <li key={f}>{f}</li>
                    ))}
                  </ul>
                </div>
                <Link
                  className="btn secondary"
                  style={{ color: "var(--blue)", borderColor: "var(--blue)" }}
                  href={viewer ? "/dashboard" : "/signup?plan=free"}
                >
                  {viewer ? "Go to Home" : "Create Free Account"}
                </Link>
              </article>
              <article className="price pro">
                <span className="popular">MOST POPULAR</span>
                <h3>GovConUnited Pro</h3>
                <div className="cost">
                  <span>
                    {billingCycle === "annual"
                      ? `$${proAnnual}`
                      : `$${proMonthly}`}
                  </span>{" "}
                  <small>
                    {billingCycle === "annual" ? "/ year" : "/ month"}
                  </small>
                </div>
                <p className="price-note">
                  {billingCycle === "annual"
                    ? "Save $98 — equivalent to two months free"
                    : "Or $490 annually and save $98"}
                </p>
                <p className="price-desc">
                  Unlock the complete opportunity, relationship, visibility, and
                  pipeline-management experience.
                </p>
                <div className="feature-group">
                  <h4>Everything in Free, plus</h4>
                  <ul>
                    {proPlanFeatures.map((f) => (
                      <li key={f}>{f}</li>
                    ))}
                  </ul>
                </div>
                <Link
                  className="btn"
                  href={viewer ? "/dashboard" : "/signup?plan=pro"}
                >
                  {viewer && viewer.planSelection === "pro"
                    ? "Manage Pro Plan"
                    : "Upgrade to Pro"}
                </Link>
              </article>
            </div>
          </div>
        </section>
      </main>

      <SiteFooter settings={siteSettings} viewer={viewer} />

      {bidLimit !== null && <BidLimitPrompt limit={bidLimit} onClose={() => setBidLimit(null)} />}

      <ChatbotLoader
        userName={
          viewer ? `${viewer.firstName} ${viewer.lastName}`.trim() : undefined
        }
        accountType={viewer?.planSelection}
      />
    </>
  );
}
