import type { Metadata } from "next";
import { confirmEmailAction } from "../../actions";
import { ConfirmButton } from "./ConfirmButton";

export const metadata: Metadata = { title: "Confirm · GovConUnited" };

const COPY = {
  signup: {
    heading: "Confirm your email address",
    subtitle: "Click below to activate your GovConUnited account.",
    cta: "Confirm Email Address",
  },
  recovery: {
    heading: "Reset your password",
    subtitle: "Click below to continue resetting your password.",
    cta: "Continue",
  },
} as const;

// Must not verify on load — see confirmEmailAction.
export default async function ConfirmPage({
  searchParams,
}: {
  searchParams: Promise<{ token_hash?: string; type?: string; next?: string }>;
}) {
  const { token_hash: tokenHash, type: typeParam, next } = await searchParams;
  const type = typeParam === "recovery" ? "recovery" : "signup";
  const copy = COPY[type];
  const invalid = !tokenHash;

  return (
    <>
      <h1>{copy.heading}</h1>
      <p className="auth-subtitle">{copy.subtitle}</p>

      {invalid ? (
        <div className="auth-error">That link is invalid or has expired. Please try again.</div>
      ) : (
        <form action={confirmEmailAction}>
          <input type="hidden" name="token_hash" value={tokenHash} />
          <input type="hidden" name="type" value={type} />
          <input type="hidden" name="next" value={next ?? ""} />
          <ConfirmButton label={copy.cta} />
        </form>
      )}
    </>
  );
}
