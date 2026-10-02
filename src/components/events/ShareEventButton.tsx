"use client";

import { useToast } from "@/components/toast-provider";

export function ShareEventButton() {
  const showToast = useToast();

  return (
    <button
      className="btn btn-outline btn-full"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(window.location.href);
          showToast("Event link copied");
        } catch {
          showToast("Couldn't copy the link — copy it from your browser's address bar instead");
        }
      }}
    >
      Copy Event Link
    </button>
  );
}
