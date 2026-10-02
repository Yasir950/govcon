"use client";

import { useActionState, useState } from "react";
import { resetPasswordAction } from "../actions";
import { initialAuthState } from "../auth-types";
import { EyeIcon, EyeOffIcon } from "@/components/auth/eye-icon";
import { PASSWORD_HINT } from "@/lib/password-rules";

export default function ResetPasswordForm() {
  const [state, formAction, pending] = useActionState(resetPasswordAction, initialAuthState);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  return (
    <>
      <h1>Set a new password</h1>
      <p className="auth-subtitle">Choose a new password for your GovConUnited account.</p>
      {state.error && <div className="auth-error">{state.error}</div>}
      <form action={formAction}>
        <div className="auth-field">
          <label htmlFor="password">New password</label>
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
          <p className="auth-password-hint">{PASSWORD_HINT}</p>
        </div>
        <div className="auth-field">
          <label htmlFor="confirmPassword">Confirm new password</label>
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
              aria-label={showConfirmPassword ? "Hide password" : "Show password"}
            >
              {showConfirmPassword ? <EyeOffIcon /> : <EyeIcon />}
            </button>
          </div>
        </div>
        <button className="auth-submit" type="submit" disabled={pending}>
          {pending ? "Saving…" : "Update Password"}
        </button>
      </form>
    </>
  );
}
