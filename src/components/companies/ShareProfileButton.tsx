"use client";

import { useToast } from "@/components/toast-provider";

export function ShareProfileButton() {
  const showToast = useToast();

  return (
    <button
      className="btn btn-outline"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(window.location.href);
          showToast("Profile link copied");
        } catch {
          showToast("Couldn't copy the link — copy it from your browser's address bar instead");
        }
      }}
    >
      Share Profile
    </button>
  );
}
