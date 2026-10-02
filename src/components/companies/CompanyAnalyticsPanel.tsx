"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { getCompanyAnalyticsAction } from "@/app/companies/review-actions";
import { Stars } from "@/components/companies/CompanyReviewsPanel";
import { createClient as createBrowserClient } from "@/lib/supabase/client";
import type { CompanyAnalytics } from "@/lib/supabase/queries";

const RANGES = [7, 30, 90] as const;
type Metric = "views" | "follows";

const METRIC_LABEL: Record<Metric, string> = { views: "Page views", follows: "New followers" };

function formatDay(day: string, opts: Intl.DateTimeFormatOptions = { month: "short", day: "numeric" }) {
  // day is YYYY-MM-DD (server UTC day); render it as that calendar date.
  return new Date(`${day}T00:00:00Z`).toLocaleDateString("en-US", { ...opts, timeZone: "UTC" });
}

function Delta({ current, previous }: { current: number; previous: number }) {
  if (previous === 0 && current === 0) return <span className="ca-delta flat">No change</span>;
  if (previous === 0) return <span className="ca-delta up">▲ New</span>;
  const pct = Math.round(((current - previous) / previous) * 100);
  if (pct === 0) return <span className="ca-delta flat">No change</span>;
  return (
    <span className={`ca-delta ${pct > 0 ? "up" : "down"}`}>
      {pct > 0 ? "▲" : "▼"} {Math.abs(pct)}%
    </span>
  );
}

function Tile({ label, value, sub, delta }: { label: string; value: React.ReactNode; sub?: React.ReactNode; delta?: React.ReactNode }) {
  return (
    <div className="ca-tile">
      <span className="ca-tile-label">{label}</span>
      <strong className="ca-tile-value">{value}</strong>
      {(delta || sub) && (
        <span className="ca-tile-sub">
          {delta}
          {delta && sub ? " " : null}
          {sub}
        </span>
      )}
    </div>
  );
}

function niceMax(n: number) {
  if (n <= 4) return 4;
  const pow = 10 ** Math.floor(Math.log10(n));
  for (const step of [1, 2, 2.5, 5, 10]) {
    if (step * pow >= n) return step * pow;
  }
  return 10 * pow;
}

function DailyChart({ daily, metric }: { daily: CompanyAnalytics["daily"]; metric: Metric }) {
  const [hover, setHover] = useState<number | null>(null);
  const values = daily.map((d) => d[metric]);
  const max = niceMax(Math.max(0, ...values));
  const total = values.reduce((a, b) => a + b, 0);
  const hovered = hover != null ? daily[hover] : null;

  return (
    <div className="ca-chart" onMouseLeave={() => setHover(null)}>
      <div className="ca-chart-plot">
        <div className="ca-grid" aria-hidden="true">
          {[max, max / 2, 0].map((v) => (
            <div key={v} className="ca-grid-line">
              <span>{Number.isInteger(v) ? v : v.toFixed(1)}</span>
            </div>
          ))}
        </div>
        <div className="ca-bars" role="img" aria-label={`${METRIC_LABEL[metric]} per day: ${total} total over ${daily.length} days`}>
          {daily.map((d, i) => (
            <div
              key={d.day}
              className={`ca-bar-col${hover === i ? " hover" : ""}`}
              onMouseEnter={() => setHover(i)}
              onFocus={() => setHover(i)}
              onBlur={() => setHover(null)}
              tabIndex={0}
              aria-label={`${formatDay(d.day)}: ${d[metric]} ${METRIC_LABEL[metric].toLowerCase()}`}
            >
              <div className="ca-bar" style={{ height: d[metric] ? `max(3px, ${(d[metric] / max) * 100}%)` : 0 }} />
            </div>
          ))}
        </div>
        {hovered && hover != null && (
          <div
            className="ca-tooltip"
            style={{ left: `calc(30px + (100% - 30px) * ${(hover + 0.5) / daily.length})`, transform: `translateX(${hover < daily.length / 4 ? "-10%" : hover > (daily.length * 3) / 4 ? "-90%" : "-50%"})` }}
          >
            <span className="meta">{formatDay(hovered.day, { weekday: "short", month: "short", day: "numeric" })}</span>
            <strong>
              {hovered[metric]} {METRIC_LABEL[metric].toLowerCase()}
            </strong>
          </div>
        )}
      </div>
      <div className="ca-axis" aria-hidden="true">
        <span>{daily[0] && formatDay(daily[0].day)}</span>
        <span>{daily.length > 2 && formatDay(daily[Math.floor(daily.length / 2)].day)}</span>
        <span>{daily.length > 1 && formatDay(daily[daily.length - 1].day)}</span>
      </div>
      <details className="ca-table">
        <summary>View as table</summary>
        <table>
          <thead>
            <tr>
              <th scope="col">Date</th>
              <th scope="col">Page views</th>
              <th scope="col">New followers</th>
            </tr>
          </thead>
          <tbody>
            {[...daily].reverse().map((d) => (
              <tr key={d.day}>
                <td>{formatDay(d.day, { month: "short", day: "numeric", year: "numeric" })}</td>
                <td>{d.views}</td>
                <td>{d.follows}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </div>
  );
}

export function CompanyAnalyticsPanel({ companyId, initialAnalytics }: { companyId: string; initialAnalytics: CompanyAnalytics | null }) {
  const [days, setDays] = useState<number>(initialAnalytics?.days ?? 30);
  const [data, setData] = useState<CompanyAnalytics | null>(initialAnalytics);
  const [metric, setMetric] = useState<Metric>("views");
  const [loading, setLoading] = useState(false);
  const [updatedAt, setUpdatedAt] = useState(() => Date.now());
  const [flash, setFlash] = useState(false);
  const [now, setNow] = useState(() => Date.now());

  // Kept in sync by changeRange; read by the Realtime callback.
  const daysRef = useRef(days);

  const refetch = useCallback(
    async (fromLive: boolean) => {
      const requested = daysRef.current;
      const fresh = await getCompanyAnalyticsAction(companyId, requested);
      // Ignore a response for a range the admin has since switched away from.
      if (!fresh || requested !== daysRef.current) return;
      setData(fresh);
      const at = Date.now();
      setUpdatedAt(at);
      setNow(at);
      if (fromLive) {
        setFlash(true);
        setTimeout(() => setFlash(false), 1200);
      }
    },
    [companyId],
  );

  async function changeRange(next: number) {
    if (next === days) return;
    setDays(next);
    daysRef.current = next;
    setLoading(true);
    await refetch(false);
    setLoading(false);
  }

  // Live: new page views, follows/unfollows and reviews for this company,
  // plus applications/responses to its postings (those two tables have no
  // company_id — RLS already limits a company admin's events to their own
  // company's postings, and any spurious event just costs one refetch).
  // Debounced so a burst of activity triggers one rollup query.
  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const supabase = createBrowserClient();
    let channel: ReturnType<typeof supabase.channel> | null = null;

    const schedule = () => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => {
        if (!cancelled) refetch(true);
      }, 800);
    };

    supabase.auth.getSession().then(({ data: sessionData }) => {
      if (cancelled || !sessionData.session) return;
      supabase.realtime.setAuth(sessionData.session.access_token);
      const byCompany = `company_id=eq.${companyId}`;
      channel = supabase
        .channel(`company-analytics-${companyId}-${Math.random().toString(36).slice(2)}`)
        .on("postgres_changes", { event: "INSERT", schema: "public", table: "company_views", filter: byCompany }, schedule)
        .on("postgres_changes", { event: "*", schema: "public", table: "company_follows", filter: byCompany }, schedule)
        .on("postgres_changes", { event: "*", schema: "public", table: "company_reviews", filter: byCompany }, schedule)
        .on("postgres_changes", { event: "*", schema: "public", table: "job_applications" }, schedule)
        .on("postgres_changes", { event: "*", schema: "public", table: "opportunity_responses" }, schedule)
        .subscribe();
    });

    // Catch anything missed while the tab was in the background.
    const onVisible = () => {
      if (document.visibilityState === "visible") refetch(false);
    };
    document.addEventListener("visibilitychange", onVisible);
    // Keeps the "Updated N min ago" label honest.
    const tick = setInterval(() => setNow(Date.now()), 30_000);

    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
      clearInterval(tick);
      document.removeEventListener("visibilitychange", onVisible);
      if (channel) supabase.removeChannel(channel);
    };
  }, [companyId, refetch]);

  const minutesAgo = Math.max(0, Math.floor((now - updatedAt) / 60_000));

  return (
    <section className="card panel">
      <div className="panel-head ca-head">
        <h2 className="section-title">Analytics</h2>
        <div className="ca-controls">
          <span className={`cr-live${flash ? " flash" : ""}`} title="Updates live as activity happens">
            <span className="cr-live-dot" aria-hidden="true" /> Live · {minutesAgo < 1 ? "updated just now" : `updated ${minutesAgo} min ago`}
          </span>
          <div className="ca-range" role="group" aria-label="Date range">
            {RANGES.map((r) => (
              <button key={r} type="button" className={days === r ? "active" : ""} aria-pressed={days === r} onClick={() => changeRange(r)} disabled={loading}>
                {r}d
              </button>
            ))}
          </div>
        </div>
      </div>
      <p className="meta" style={{ marginTop: 0 }}>
        Only visible to {`this company's`} admins. Changes are compared with the previous {days} days. Your own team&apos;s visits aren&apos;t counted.
      </p>

      {!data ? (
        <p className="meta">Couldn&apos;t load analytics right now. Please refresh the page.</p>
      ) : (
        <div className={loading ? "ca-loading" : undefined}>
          <div className="ca-tiles">
            <Tile label="Page views" value={data.views.toLocaleString()} delta={<Delta current={data.views} previous={data.viewsPrev} />} />
            <Tile
              label="Unique members"
              value={data.uniqueViewers.toLocaleString()}
              sub={<span className="meta">+{data.guestViews.toLocaleString()} signed-out views</span>}
            />
            <Tile
              label="Followers"
              value={data.followers.toLocaleString()}
              delta={<Delta current={data.newFollowers} previous={data.newFollowersPrev} />}
              sub={<span className="meta">+{data.newFollowers} new</span>}
            />
            <Tile
              label="Average rating"
              value={data.avgRating != null ? data.avgRating.toFixed(1) : "—"}
              sub={
                <span className="meta">
                  {data.reviewCount} review{data.reviewCount === 1 ? "" : "s"}
                  {data.unansweredReviews > 0 && ` · ${data.unansweredReviews} awaiting response`}
                </span>
              }
            />
            <Tile label="Job applications" value={data.applications.toLocaleString()} delta={<Delta current={data.applications} previous={data.applicationsPrev} />} />
            <Tile
              label="Opportunity responses"
              value={data.opportunityResponses.toLocaleString()}
              delta={<Delta current={data.opportunityResponses} previous={data.opportunityResponsesPrev} />}
            />
            <Tile label="Company post views" value={data.postViews.toLocaleString()} delta={<Delta current={data.postViews} previous={data.postViewsPrev} />} />
            <Tile label="New reviews" value={data.newReviews.toLocaleString()} sub={<span className="meta">in the last {days} days</span>} />
          </div>

          <div className="ca-section">
            <div className="ca-section-head">
              <h3>{METRIC_LABEL[metric]} per day</h3>
              <div className="ca-range" role="group" aria-label="Chart metric">
                {(Object.keys(METRIC_LABEL) as Metric[]).map((m) => (
                  <button key={m} type="button" className={metric === m ? "active" : ""} aria-pressed={metric === m} onClick={() => setMetric(m)}>
                    {METRIC_LABEL[m]}
                  </button>
                ))}
              </div>
            </div>
            <DailyChart daily={data.daily} metric={metric} />
          </div>

          <div className="ca-section">
            <div className="ca-section-head">
              <h3>Rating distribution</h3>
              {data.avgRating != null && <Stars value={data.avgRating} />}
            </div>
            {data.reviewCount === 0 ? (
              <p className="meta">No reviews yet.</p>
            ) : (
              <div className="cr-breakdown">
                {(["5", "4", "3", "2", "1"] as const).map((star) => {
                  const count = data.ratingBreakdown[star] ?? 0;
                  return (
                    <div key={star} className="cr-breakdown-row static">
                      <span className="cr-breakdown-label">{star} ★</span>
                      <span className="cr-breakdown-track">
                        <span className="cr-breakdown-bar" style={{ width: `${(count / data.reviewCount) * 100}%` }} />
                      </span>
                      <span className="cr-breakdown-count">{count}</span>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}
    </section>
  );
}
