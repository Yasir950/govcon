"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState } from "react";
import { BadgeCheck, Trophy } from "lucide-react";
import { useToast } from "@/components/toast-provider";
import { leaveCompanyAction, sendWorkEmailVerificationAction } from "@/app/companies/employee-actions";
import type { CompanySocialSummary } from "@/lib/team-social-types";

// Company page, sidebar: verified employees, this month's standing on the
// company leaderboard, and "work here? verify with your work email".
export function CompanyEmployeesPanel({
  company,
  summary,
  signedIn,
}: {
  company: { id: string; name: string };
  summary: CompanySocialSummary;
  signedIn: boolean;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const showToast = useToast();
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const me = summary.me;
  const isMine = me?.company_id === company.id;
  const needed = Math.max(0, summary.min_active - summary.active_employees);
  const domains = summary.domains;

  const send = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const res = await sendWorkEmailVerificationAction(company.id, email);
    setBusy(false);
    if (res.error) setError(res.error);
    else setSentTo(res.email ?? email);
  };

  const leave = async () => {
    if (!window.confirm(`Stop counting as a verified employee of ${company.name}?`)) return;
    setBusy(true);
    const res = await leaveCompanyAction();
    setBusy(false);
    if (res.error) showToast(res.error);
    else router.refresh();
  };

  return (
    <section className="card panel social-card" id="company-leaderboard">
      <div className="panel-head">
        <h2 className="section-title">
          <Trophy size={16} aria-hidden="true" /> Company leaderboard
        </h2>
        <Link href="/rewards?tab=leaderboards#companies" className="link-btn">
          View
        </Link>
      </div>

      {summary.top_company_months.length > 0 && (
        <div className="social-top-badges">
          {summary.top_company_months.slice(0, 3).map((m) => (
            <span key={m.month} className="social-top-company">
              <Trophy size={13} aria-hidden="true" /> Top Company · {m.label}
            </span>
          ))}
        </div>
      )}

      <dl className="social-facts">
        <div>
          <dt>{summary.month_label}</dt>
          <dd>{summary.position ? `#${summary.position}` : "Not ranked yet"}</dd>
        </div>
        {summary.score != null && (
          <div>
            <dt>Avg weekly XP</dt>
            <dd>{summary.score.toLocaleString()}</dd>
          </div>
        )}
        <div>
          <dt>Active / verified</dt>
          <dd>
            {summary.active_employees} / {summary.verified_employees}
          </dd>
        </div>
      </dl>
      {!summary.position && (
        <p className="meta social-note">
          {needed > 0
            ? `Needs ${needed} more active verified employee${needed === 1 ? "" : "s"} to rank this month.`
            : "Ranks once the leaderboard updates."}
        </p>
      )}

      {isMine ? (
        <p className="meta social-note">
          <BadgeCheck size={13} aria-hidden="true" /> You&apos;re a verified employee ({me!.work_email}).{" "}
          <button type="button" className="link-btn" disabled={busy} onClick={leave}>
            Leave
          </button>
        </p>
      ) : !signedIn ? (
        <p className="meta social-note">
          <Link href={`/login?next=${encodeURIComponent(pathname)}`}>Sign in</Link> to verify that you work here.
        </p>
      ) : domains.length === 0 ? (
        <p className="meta social-note">Employees can verify once this page lists a company website or business email.</p>
      ) : sentTo ? (
        <p className="meta social-note">Check {sentTo} for a link to confirm. It expires in 24 hours.</p>
      ) : (
        <form className="social-verify" onSubmit={send}>
          <label className="label">
            Work here? Verify with your work email
            <input
              className="field"
              type="email"
              required
              value={email}
              placeholder={`you@${domains[0]}`}
              onChange={(e) => setEmail(e.target.value)}
            />
          </label>
          {me && (
            <p className="meta" style={{ margin: 0 }}>
              You&apos;re verified at {me.company_name}. Verifying here moves you.
            </p>
          )}
          {error && <div className="auth-error">{error}</div>}
          <button type="submit" className="btn btn-primary btn-sm" disabled={busy}>
            {busy ? "Sending…" : "Send link"}
          </button>
        </form>
      )}
    </section>
  );
}
