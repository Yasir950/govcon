"use client";

import Link from "next/link";
import { useState } from "react";
import { confirmWorkEmailAction } from "@/app/companies/employee-actions";

export function ConfirmWorkEmail({ token }: { token: string }) {
  const [pending, setPending] = useState(false);
  const [result, setResult] = useState<{ error?: string; slug?: string } | null>(null);

  async function confirm() {
    setPending(true);
    setResult(await confirmWorkEmailAction(token));
    setPending(false);
  }

  if (!token) {
    return <p className="meta" style={{ margin: 0 }}>This verification link is incomplete. Open the link from the email again.</p>;
  }

  if (result?.slug) {
    return (
      <>
        <p style={{ margin: 0 }}>You&apos;re a verified employee. Your activity now counts toward your company&apos;s monthly leaderboard.</p>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <Link className="btn btn-primary" href={`/companies/${result.slug}`}>
            View company
          </Link>
          <Link className="btn btn-outline" href="/rewards?tab=leaderboards">
            See the leaderboard
          </Link>
        </div>
      </>
    );
  }

  return (
    <>
      <p className="meta" style={{ margin: 0 }}>Confirm this work email to join your company as a verified employee on GovConUnited.</p>
      {result?.error && <div className="auth-error">{result.error}</div>}
      <div>
        <button type="button" className="btn btn-primary" disabled={pending} onClick={confirm}>
          {pending ? "Verifying…" : "Confirm work email"}
        </button>
      </div>
    </>
  );
}
