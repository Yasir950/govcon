"use client";

import { createContext, useCallback, useContext, useState } from "react";
import LoginForm from "@/app/(auth)/login/LoginForm";

type PromptOptions = { message?: string };
type PromptSignIn = (options?: PromptOptions) => void;

const SignInPromptContext = createContext<PromptSignIn | null>(null);
// Separate context (rather than bundling into SignInPromptContext) so the
// many simple "prompt sign-in" consumers keep their existing single-value
// useSignInPrompt() call. LoginForm uses this one to close the popup itself
// before a client-side navigation (e.g. the "Join GovConUnited Free" link),
// since navigating to /signup swaps `children` but doesn't unmount this
// provider (it lives in the root layout) — without this, `open` stays true
// and the popup keeps floating over the destination page.
const SignInPromptCloseContext = createContext<(() => void) | null>(null);

// Same shape as ToastProvider (a single instance mounted once in the root
// layout, exposed via a hook) — a real in-page popup for "sign in to do
// this" moments across the whole app (landing page, profile/company pages,
// jobs/opportunities/events/community/resources — every consumer of
// useRequireAuth), replacing a hard router.push to /signup. Embeds the
// actual LoginForm (same component the standalone /login page renders)
// rather than a second, simplified login implementation, so this stays in
// sync with real auth behavior (OAuth providers, error states, etc.)
// automatically.
export function SignInPromptProvider({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const [message, setMessage] = useState<string | undefined>();

  const promptSignIn = useCallback<PromptSignIn>((options) => {
    setMessage(options?.message);
    setOpen(true);
  }, []);

  const close = useCallback(() => {
    setOpen(false);
  }, []);

  const destination = typeof window !== "undefined" ? window.location.pathname + window.location.search : "/";

  return (
    <SignInPromptContext.Provider value={promptSignIn}>
    <SignInPromptCloseContext.Provider value={close}>
      {children}
      {open && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 200,
            background: "rgba(7,23,63,.5)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: 16,
            overflowY: "auto",
          }}
          onClick={close}
        >
          <div
            className="auth-card"
            style={{
              maxWidth: 440,
              width: "100%",
              position: "relative",
              margin: "auto",
              background: "#fff",
              borderRadius: 16,
              padding: "36px 32px",
              boxShadow: "0 20px 60px rgba(7,23,63,.3)",
              maxHeight: "90vh",
              overflowY: "auto",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <button
              onClick={close}
              aria-label="Close"
              style={{
                position: "absolute",
                top: 14,
                right: 16,
                border: 0,
                background: "none",
                fontSize: "1.3rem",
                cursor: "pointer",
                color: "var(--o-muted, #667386)",
                lineHeight: 1,
                zIndex: 1,
              }}
            >
              ×
            </button>
            {/* Unlike the standalone /login page, this popup has no split
                visual pane showing the logo, so it needs its own — shown at
                every width (the standalone page's .auth-logo is desktop-hidden
                since the visual pane already carries the logo there). */}
            <div style={{ textAlign: "center", marginBottom: 20 }}>
              <img src="/images/logo-black.svg" alt="GovConUnited" style={{ height: 30 }} />
            </div>
            <LoginForm next={destination} justReset={false} heading={message ?? "Sign in to continue"} />
          </div>
        </div>
      )}
    </SignInPromptCloseContext.Provider>
    </SignInPromptContext.Provider>
  );
}

export function useSignInPrompt() {
  const promptSignIn = useContext(SignInPromptContext);
  if (!promptSignIn) throw new Error("useSignInPrompt must be used within a SignInPromptProvider");
  return promptSignIn;
}

export function useCloseSignInPrompt() {
  const close = useContext(SignInPromptCloseContext);
  if (!close) throw new Error("useCloseSignInPrompt must be used within a SignInPromptProvider");
  return close;
}
