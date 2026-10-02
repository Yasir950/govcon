"use client";

import Link from "next/link";
import { useActionState, useState } from "react";
import {
  signInWithFacebookAction,
  signInWithGoogleAction,
  signInWithLinkedInAction,
  signUpAction,
} from "../actions";
import { initialAuthState } from "../auth-types";
import { FacebookAuthIcon } from "@/components/auth/facebook-icon";
import { GoogleIcon } from "@/components/auth/google-icon";
import { LinkedInIcon } from "@/components/auth/linkedin-icon";
import { EyeIcon, EyeOffIcon } from "@/components/auth/eye-icon";
import { PASSWORD_HINT } from "@/lib/password-rules";

const referralOptions = [
  "Search engine",
  "Social media",
  "Colleague or referral",
  "Industry event or conference",
  "GovCon publication or newsletter",
  "Other",
];

export default function SignupForm({
  next,
  plan,
  invitedBy = null,
}: {
  next: string;
  plan: "free" | "pro";
  // A member's invite link (/signup?ref=<id>) — credited once this account
  // completes its profile and is active 7 days (Points & Rewards).
  invitedBy?: string | null;
}) {
  const [state, formAction, pending] = useActionState(
    signUpAction,
    initialAuthState,
  );
  const loginHref =
    next !== "/" ? `/login?next=${encodeURIComponent(next)}` : "/login";
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  if (state.success) {
    return (
      <>
        <h1>Check your email</h1>
        <p className="auth-subtitle">
          We sent a verification link to <b>{state.email}</b>. Confirm your
          email to activate your GovConUnited account.
        </p>
        <div className="auth-links">
          <p>
            Already verified? <Link href={loginHref}>Log in</Link>
          </p>
        </div>
      </>
    );
  }

  return (
    <>
      <h1>Join GovConUnited Free</h1>
      <p className="auth-subtitle">
        Create your account to discover opportunities, build your network, and
        grow in the public sector.
      </p>

      {plan === "pro" && (
        <div className="auth-plan-note">
          You selected <b>GovConUnited Pro</b> ($49/mo or $490/yr). Verify your
          email first — you&apos;ll be able to complete billing from your
          dashboard right after.
        </div>
      )}
      {state.error && <div className="auth-error">{state.error}</div>}

      <form action={formAction}>
        <input type="hidden" name="next" value={next} />
        <input type="hidden" name="plan" value={plan} />
        {invitedBy && <input type="hidden" name="invitedBy" value={invitedBy} />}

        <div className="auth-row">
          <div className="auth-field">
            <label htmlFor="firstName">First name</label>
            <input
              id="firstName"
              name="firstName"
              autoComplete="given-name"
              required
            />
          </div>
          <div className="auth-field">
            <label htmlFor="lastName">Last name</label>
            <input
              id="lastName"
              name="lastName"
              autoComplete="family-name"
              required
            />
          </div>
        </div>

        <div className="auth-field">
          <label htmlFor="email">Email</label>
          <input
            id="email"
            name="email"
            type="email"
            autoComplete="email"
            required
          />
        </div>

        <div className="auth-row">
          <div className="auth-field">
            <label htmlFor="password">Password</label>
            <div className="auth-password-wrap">
              <input
                id="password"
                name="password"
                type={showPassword ? "text" : "password"}
                autoComplete="new-password"
                minLength={8}
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
          <div className="auth-field">
            <label htmlFor="confirmPassword">Confirm password</label>
            <div className="auth-password-wrap">
              <input
                id="confirmPassword"
                name="confirmPassword"
                type={showConfirmPassword ? "text" : "password"}
                autoComplete="new-password"
                minLength={8}
                required
              />
              <button
                type="button"
                className="auth-password-toggle"
                onClick={() => setShowConfirmPassword((v) => !v)}
                aria-label={
                  showConfirmPassword ? "Hide password" : "Show password"
                }
              >
                {showConfirmPassword ? <EyeOffIcon /> : <EyeIcon />}
              </button>
            </div>
          </div>
        </div>
        <p className="auth-password-hint">{PASSWORD_HINT}</p>

        <div className="auth-field">
          <label htmlFor="referralSource">
            How did you hear about us? (optional)
          </label>
          <select id="referralSource" name="referralSource" defaultValue="">
            <option value="">Select an option</option>
            {referralOptions.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
        </div>

        {/* <label className="auth-check">
          <input type="checkbox" name="marketingConsent" />
          <span>Send me GovCon opportunity alerts and product updates by email.</span>
        </label> */}

        <label className="auth-check">
          <input type="checkbox" name="termsAccepted" required />
          <span>
            I agree to the <Link href="/terms">Terms of Use</Link> and{" "}
            <Link href="/privacy">Privacy Policy</Link>.
          </span>
        </label>

        <button className="auth-submit" type="submit" disabled={pending}>
          {pending ? "Creating your account…" : "Create Free Account"}
        </button>
      </form>

      <div className="auth-divider">or</div>

      <div className="auth-oauth">
        <form action={signInWithGoogleAction}>
          <input type="hidden" name="next" value={next} />
          <input type="hidden" name="plan" value={plan} />
          <button className="auth-oauth-btn" type="submit">
            <GoogleIcon />
            Continue with Google
          </button>
        </form>
        <form action={signInWithFacebookAction}>
          <input type="hidden" name="next" value={next} />
          <input type="hidden" name="plan" value={plan} />
          <button className="auth-oauth-btn" type="submit">
            <FacebookAuthIcon />
            Continue with Facebook
          </button>
        </form>
        <form action={signInWithLinkedInAction}>
          <input type="hidden" name="next" value={next} />
          <input type="hidden" name="plan" value={plan} />
          <button className="auth-oauth-btn" type="submit">
            <LinkedInIcon />
            Continue with LinkedIn
          </button>
        </form>
      </div>

      <div className="auth-links">
        <p>
          Already have an account? <Link href={loginHref}>Log in</Link>
        </p>
      </div>
    </>
  );
}
