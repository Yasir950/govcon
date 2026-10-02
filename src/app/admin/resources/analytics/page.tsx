import Link from "next/link";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

const PERIODS = [
  { key: "7", label: "7 days", days: 7 },
  { key: "30", label: "30 days", days: 30 },
  { key: "all", label: "All time", days: null },
] as const;

interface Insights {
  searches: { query: string; count: number; last_at: string }[];
  requests: { topic: string; details: string | null; created_at: string; member: string }[];
  request_topics: { topic: string; count: number }[];
  pro: { modal_views: number; modal_viewers: number; upgrade_clicks: number; upgrade_clickers: number; now_pro: number } | null;
}

function pct(n: number, d: number) {
  return d ? `${Math.round((n / d) * 100)}%` : "—";
}

// Admin → Resources → Analytics. resource_analytics / resource_library_insights
// check is_admin as the caller, so they run on the admin's own session.
export default async function ResourceAnalyticsPage({ searchParams }: { searchParams: Promise<{ days?: string }> }) {
  const { days } = await searchParams;
  const period = PERIODS.find((p) => p.key === days) ?? PERIODS[1];
  const supabase = await createClient();
  const args = period.days == null ? {} : { p_days: period.days };
  const [{ data: stats, error }, { data: insightsRaw, error: insightsError }, { data: resources }] = await Promise.all([
    supabase.rpc("resource_analytics", args),
    supabase.rpc("resource_library_insights", args),
    createAdminClient().from("resources").select("id, title, kind, type, deleted_at").is("deleted_at", null),
  ]);
  if (error) throw error;
  if (insightsError) throw insightsError;
  const insights = (insightsRaw ?? {}) as unknown as Insights;

  const byId = new Map((resources ?? []).map((r) => [r.id, r]));
  const rows = (stats ?? [])
    .filter((s) => byId.has(s.resource_id))
    .map((s) => ({
      ...byId.get(s.resource_id)!,
      views: Number(s.views),
      clicks: Number(s.clicks),
      saves: Number(s.saves),
      members: Number(s.unique_members),
    }))
    .sort((a, b) => b.views + b.clicks - (a.views + a.clicks) || b.saves - a.saves || a.title.localeCompare(b.title));
  const totals = rows.reduce((t, r) => ({ views: t.views + r.views, clicks: t.clicks + r.clicks, saves: t.saves + r.saves }), {
    views: 0,
    clicks: 0,
    saves: 0,
  });
  const top = rows.filter((r) => r.views + r.clicks + r.saves > 0).slice(0, 10);
  const pro = insights.pro ?? { modal_views: 0, modal_viewers: 0, upgrade_clicks: 0, upgrade_clickers: 0, now_pro: 0 };

  return (
    <div className="stack">
      <div className="ra-toolbar">
        <div className="ra-view-switch">
          {PERIODS.map((p) => (
            <Link
              key={p.key}
              href={`/admin/resources/analytics?days=${p.key}`}
              className={`btn btn-sm ${p.key === period.key ? "btn-primary" : "btn-outline"}`}
            >
              {p.label}
            </Link>
          ))}
        </div>
      </div>

      <div className="admin-stat-grid">
        <div className="admin-stat-card"><small className="meta">Views</small><strong>{totals.views.toLocaleString()}</strong></div>
        <div className="admin-stat-card"><small className="meta">Downloads / clicks / plays</small><strong>{totals.clicks.toLocaleString()}</strong></div>
        <div className="admin-stat-card"><small className="meta">Saves</small><strong>{totals.saves.toLocaleString()}</strong></div>
        <div className="admin-stat-card"><small className="meta">Searches with no results</small><strong>{insights.searches?.reduce((n, s) => n + Number(s.count), 0) ?? 0}</strong></div>
      </div>

      <section className="card panel">
        <h2 className="section-title">Top 10 resources</h2>
        {top.length === 0 ? (
          <p className="meta">No activity in this period yet.</p>
        ) : (
          <ol className="ra-top-list">
            {top.map((r) => (
              <li key={r.id}>
                <Link href={`/admin/resources/${r.id}/edit`} className="ra-title">{r.title}</Link>
                <span className="meta">
                  {r.views.toLocaleString()} views · {r.clicks.toLocaleString()} {r.kind === "file" ? "downloads" : r.kind === "video" ? "plays" : "clicks"} ·{" "}
                  {r.saves.toLocaleString()} saves
                </span>
              </li>
            ))}
          </ol>
        )}
      </section>

      <section className="card panel">
        <h2 className="section-title">Pro upgrades from Resources</h2>
        <div className="admin-stat-grid" style={{ marginBottom: 0 }}>
          <div className="admin-stat-card">
            <small className="meta">Upgrade modal views</small>
            <strong>{pro.modal_views.toLocaleString()}</strong>
            <span className="meta">{pro.modal_viewers.toLocaleString()} members</span>
          </div>
          <div className="admin-stat-card">
            <small className="meta">Clicked Upgrade</small>
            <strong>{pro.upgrade_clicks.toLocaleString()}</strong>
            <span className="meta">{pro.upgrade_clickers.toLocaleString()} members · {pct(pro.upgrade_clickers, pro.modal_viewers)} of viewers</span>
          </div>
          <div className="admin-stat-card">
            <small className="meta">Now Pro</small>
            <strong>{pro.now_pro.toLocaleString()}</strong>
            <span className="meta">{pct(pro.now_pro, pro.upgrade_clickers)} of those who clicked</span>
          </div>
        </div>
      </section>

      <div className="ra-two-col">
        <section className="card panel">
          <h2 className="section-title">Searches with no results</h2>
          <p className="meta" style={{ marginTop: 4 }}>What members looked for and didn&apos;t find — ideas for new resources.</p>
          {!insights.searches?.length ? (
            <p className="meta">None in this period.</p>
          ) : (
            <table className="points-table">
              <thead><tr><th>Search</th><th className="ra-num">Times</th><th>Last</th></tr></thead>
              <tbody>
                {insights.searches.map((s) => (
                  <tr key={s.query}>
                    <td>{s.query}</td>
                    <td className="ra-num">{s.count}</td>
                    <td className="meta">{new Date(s.last_at).toLocaleDateString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>
        <section className="card panel">
          <h2 className="section-title">Request-a-Resource topics</h2>
          {!insights.request_topics?.length ? (
            <p className="meta">No requests in this period.</p>
          ) : (
            <>
              <div className="ra-badges" style={{ margin: "8px 0 12px" }}>
                {insights.request_topics.map((t) => (
                  <span key={t.topic} className="tag gray">{t.topic} · {t.count}</span>
                ))}
              </div>
              <ul className="ra-history-list">
                {insights.requests.map((q, i) => (
                  <li key={i}>
                    <div className="ra-history-main">
                      <strong>{q.topic}</strong>
                      <span className="meta">{q.member} · {new Date(q.created_at).toLocaleDateString()}</span>
                    </div>
                    {q.details && <div className="meta">{q.details}</div>}
                  </li>
                ))}
              </ul>
            </>
          )}
        </section>
      </div>

      <section className="card panel">
        <h2 className="section-title">Every resource</h2>
        <div className="ra-table-wrap">
          <table className="points-table ra-table">
            <thead>
              <tr>
                <th>Title</th>
                <th>Type</th>
                <th className="ra-num">Views</th>
                <th className="ra-num">Downloads / clicks</th>
                <th className="ra-num">Saves</th>
                <th className="ra-num">Unique members</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id}>
                  <td><Link href={`/admin/resources/${r.id}/edit`}>{r.title}</Link></td>
                  <td>{r.type}</td>
                  <td className="ra-num">{r.views.toLocaleString()}</td>
                  <td className="ra-num">{r.clicks.toLocaleString()}</td>
                  <td className="ra-num">{r.saves.toLocaleString()}</td>
                  <td className="ra-num">{r.members.toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
