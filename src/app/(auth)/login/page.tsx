import type { Metadata } from "next";
import LoginForm from "./LoginForm";

export const metadata: Metadata = { title: "Log In · GovConUnited" };

const oauthErrorMessages: Record<string, string> = {
  oauth_failed: "Couldn't start that sign-in. Please try again.",
  auth_callback_failed: "That link is invalid or has expired. Please try again.",
};

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string; reset?: string; error?: string }>;
}) {
  const params = await searchParams;
  return (
    <LoginForm
      next={params.next ?? "/dashboard"}
      justReset={params.reset === "success"}
      oauthError={params.error ? oauthErrorMessages[params.error] : undefined}
    />
  );
}
