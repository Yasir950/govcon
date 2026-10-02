"use client";

import Link from "next/link";
import { useState } from "react";
import { confirmBusinessEmailAction } from "@/app/companies/partner-actions";

export function ConfirmBusinessEmail({ token }: { token: string }) {
  const [pending, setPending] = useState(false);
  const [result, setResult] = useState<{ error?: string; slug?: string } | null>(null);

  async function confirm() {
    setPending(true);
    setResult(await confirmBusinessEmailAction(token));
    setPending(false);
  }

  if (!token) {
    return <p className="meta" style={{ margin: 0 }}>This verification link is incomplete. Open the link from the email again.</p>;
  }

  if (result?.slug) {
    return (
      <>
        <p style={{ margin: 0 }}>Your business email is verified.</p>
        <div>
          <Link className="btn btn-primary" href="/partners?apply=1">
            Continue partner application
          </Link>
        </div>
      </>
    );
  }

  return (
    <>
      <p className="meta" style={{ margin: 0 }}>Confirm that this address is your company&apos;s business email on GovConUnited.</p>
      {result?.error && <div className="auth-error">{result.error}</div>}
      <div>
        <button type="button" className="btn btn-primary" disabled={pending} onClick={confirm}>
          {pending ? "Verifying…" : "Verify email address"}
        </button>
      </div>
    </>
  );
}
