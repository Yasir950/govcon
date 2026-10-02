"use client";

import { useState } from "react";
import { toggleCompanyFollowAction } from "@/app/companies/actions";
import { useSignInPrompt } from "@/components/sign-in-prompt-provider";
import { useToast } from "@/components/toast-provider";
import type { Viewer } from "@/lib/supabase/viewer";

export function FollowCompanyButton({
  companyId,
  companyName,
  viewer,
  initialFollowing = false,
}: {
  companyId: string;
  companyName: string;
  viewer: Viewer | null;
  initialFollowing?: boolean;
}) {
  const showToast = useToast();
  const promptSignIn = useSignInPrompt();
  const [following, setFollowing] = useState(initialFollowing);
  const [pending, setPending] = useState(false);

  async function handleClick() {
    if (!viewer) {
      promptSignIn({ message: `Sign in or create a free account to follow ${companyName}.` });
      return;
    }
    setPending(true);
    const result = await toggleCompanyFollowAction(companyId);
    setPending(false);
    if (result.error) {
      showToast(result.error);
      return;
    }
    setFollowing(result.active);
    showToast(result.active ? `Now following ${companyName}` : `Unfollowed ${companyName}`);
  }

  return (
    <button
      className={`btn btn-sm${following ? " btn-accent" : " btn-primary"}`}
      disabled={pending}
      onClick={handleClick}
    >
      {following ? "✓ Following" : "+ Follow Company"}
    </button>
  );
}
