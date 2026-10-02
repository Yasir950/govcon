import type { Metadata } from "next";
import SignupForm from "./SignupForm";

export const metadata: Metadata = { title: "Join GovConUnited Free" };

export default async function SignupPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string; plan?: string; ref?: string }>;
}) {
  const params = await searchParams;
  const plan = params.plan === "pro" ? "pro" : "free";
  const invitedBy = params.ref && /^[0-9a-f-]{36}$/i.test(params.ref) ? params.ref : null;
  return <SignupForm next={params.next ?? "/dashboard"} plan={plan} invitedBy={invitedBy} />;
}
