"use client";

import { useCallback } from "react";
import { useSignInPrompt } from "@/components/sign-in-prompt-provider";
import type { Viewer } from "@/lib/supabase/viewer";

// Engagement actions (save, connect, follow, register, vote, message…)
// require an account. Signed-out visitors get the same in-page "Join
// GovConUnited to continue" popup everywhere this hook is used (landing
// page, jobs/opportunities/events/community/resources listings and detail
// pages, etc.) instead of a hard redirect to /signup — SignInPromptProvider
// is mounted once in the root layout, so this hook's behavior updates for
// every one of its ~15 call sites from this single change.
export function useRequireAuth(viewer: Viewer | null) {
  const promptSignIn = useSignInPrompt();
  return useCallback(
    (action: () => void) => {
      if (!viewer) {
        promptSignIn();
        return;
      }
      action();
    },
    [viewer, promptSignIn],
  );
}
