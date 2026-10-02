import type { Metadata } from "next";
import { ConfirmWorkEmail } from "./ConfirmWorkEmail";

export const metadata: Metadata = {
  title: "Verify work email · GovConUnited",
  robots: { index: false },
};

// Linked from the email sent by sendWorkEmailVerificationAction.
// Verification happens on the button click, never on page load.
export default async function VerifyWorkEmailPage({ searchParams }: { searchParams: Promise<{ token?: string }> }) {
  const { token } = await searchParams;
  return (
    <section className="main">
      <div className="wrap">
        <div className="opps-app card panel" style={{ maxWidth: 560, margin: "40px auto", display: "grid", gap: 14 }}>
          <h1 style={{ margin: 0 }}>Verify work email</h1>
          <ConfirmWorkEmail token={token ?? ""} />
        </div>
      </div>
    </section>
  );
}
