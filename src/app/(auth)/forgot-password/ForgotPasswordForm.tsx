"use client";

import Link from "next/link";
import { useActionState } from "react";
import { forgotPasswordAction } from "../actions";
import { initialAuthState } from "../auth-types";

export default function ForgotPasswordForm() {
  const [state, formAction, pending] = useActionState(forgotPasswordAction, initialAuthState);

  if (state.success) {
    return (
      <>
        <h1>Check your email</h1>
        <p className="auth-subtitle">
          If an account exists for <b>{state.email}</b>, we&apos;ve sent a link to reset your
          password.
        </p>
        <div className="auth-links">
          <p>
            <Link href="/login">Back to log in</Link>
          </p>
        </div>
      </>
    );
  }

  return (
    <>
      <h1>Reset your password</h1>
      <p className="auth-subtitle">
        Enter the email on your account and we&apos;ll send you a reset link.
      </p>
      {state.error && <div className="auth-error">{state.error}</div>}
      <form action={formAction}>
        <div className="auth-field">
          <label htmlFor="email">Email</label>
          <input id="email" name="email" type="email" autoComplete="email" required />
        </div>
        <button className="auth-submit" type="submit" disabled={pending}>
          {pending ? "Sending…" : "Send Reset Link"}
        </button>
      </form>
      <div className="auth-links">
        <p>
          <Link href="/login">Back to log in</Link>
        </p>
      </div>
    </>
  );
}
