"use client";

import Link from "next/link";
import { useActionState, useState } from "react";
import {
  signInAction,
  signInWithGoogleAction,
  signInWithFacebookAction,
  signInWithLinkedInAction,
} from "../actions";
import { initialAuthState } from "../auth-types";
import { FacebookAuthIcon } from "@/components/auth/facebook-icon";
import { GoogleIcon } from "@/components/auth/google-icon";
import { LinkedInIcon } from "@/components/auth/linkedin-icon";
import { EyeIcon, EyeOffIcon } from "@/components/auth/eye-icon";
import { useCloseSignInPrompt } from "@/components/sign-in-prompt-provider";

export default function LoginForm({
  next,
  justReset,
  oauthError,
  heading = "Log in to GovConUnited",
  subtitle = "Welcome back. Enter your details to continue.",
}: {
  next: string;
  justReset: boolean;
  oauthError?: string;
  // Overridable so the sign-in popup (SignInPromptProvider) can show
  // context-specific copy ("Sign in to connect with...") above the exact
  // same real form/actions the standalone /login page uses, instead of
  // maintaining a second, simplified login implementation.
  heading?: string;
  subtitle?: string;
}) {
  const [state, formAction, pending] = useActionState(signInAction, initialAuthState);
  const signupHref = next !== "/" ? `/signup?next=${encodeURIComponent(next)}` : "/signup";
  const [showPassword, setShowPassword] = useState(false);
  // SignInPromptProvider is mounted globally in the root layout, so this is
  // available here too even on the standalone /login page — closing there
  // is a no-op since the popup is already closed. Needed because navigating
  // via these Links swaps the route's content but doesn't unmount the
  // provider, so the popup would otherwise stay open over the new page.
  const closeSignInPrompt = useCloseSignInPrompt();

  return (
    <>
      <h1>{heading}</h1>
      <p className="auth-subtitle">{subtitle}</p>

      {justReset && (
        <div className="auth-success">
          Your password has been updated. Log in with your new password.
        </div>
      )}
      {oauthError && <div className="auth-error">{oauthError}</div>}
      {state.error && <div className="auth-error">{state.error}</div>}

      <div className="auth-oauth">
        <form action={signInWithGoogleAction}>
          <input type="hidden" name="next" value={next} />
          <button className="auth-oauth-btn" type="submit">
            <GoogleIcon />
            Continue with Google
          </button>
        </form>
        <form action={signInWithFacebookAction}>
          <input type="hidden" name="next" value={next} />
          <button className="auth-oauth-btn" type="submit">
            <FacebookAuthIcon />
            Continue with Facebook
          </button>
        </form>
        <form action={signInWithLinkedInAction}>
          <input type="hidden" name="next" value={next} />
          <button className="auth-oauth-btn" type="submit">
            <LinkedInIcon />
            Continue with LinkedIn
          </button>
        </form>
      </div>

      <div className="auth-divider">or</div>

      <form action={formAction}>
        <input type="hidden" name="next" value={next} />
        <div className="auth-field">
          <label htmlFor="email">Email</label>
          <input id="email" name="email" type="email" autoComplete="email" required />
        </div>
        <div className="auth-field">
          <label htmlFor="password">Password</label>
          <div className="auth-password-wrap">
            <input
              id="password"
              name="password"
              type={showPassword ? "text" : "password"}
              autoComplete="current-password"
              required
            />
            <button
              type="button"
              className="auth-password-toggle"
              onClick={() => setShowPassword((v) => !v)}
              aria-label={showPassword ? "Hide password" : "Show password"}
            >
              {showPassword ? <EyeOffIcon /> : <EyeIcon />}
            </button>
          </div>
        </div>
        <button className="auth-submit" type="submit" disabled={pending}>
          {pending ? "Logging in…" : "Log In"}
        </button>
      </form>

      <div className="auth-links">
        <p>
          <Link href="/forgot-password" onClick={closeSignInPrompt}>Forgot your password?</Link>
        </p>
        <p>
          Don&apos;t have an account? <Link href={signupHref} onClick={closeSignInPrompt}>Join GovConUnited Free</Link>
        </p>
      </div>
    </>
  );
}
