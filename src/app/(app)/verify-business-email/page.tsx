import type { Metadata } from "next";
import { ConfirmBusinessEmail } from "./ConfirmBusinessEmail";

export const metadata: Metadata = {
  title: "Verify business email · GovConUnited",
  robots: { index: false },
};

// Linked from the email sent by sendBusinessEmailVerificationAction.
// Verification happens on the button click, never on page load.
export default async function VerifyBusinessEmailPage({ searchParams }: { searchParams: Promise<{ token?: string }> }) {
  const { token } = await searchParams;
  return (
    <section className="main">
      <div className="wrap">
        <div className="opps-app card panel" style={{ maxWidth: 560, margin: "40px auto", display: "grid", gap: 14 }}>
          <h1 style={{ margin: 0 }}>Verify business email</h1>
          <ConfirmBusinessEmail token={token ?? ""} />
        </div>
      </div>
    </section>
  );
}
