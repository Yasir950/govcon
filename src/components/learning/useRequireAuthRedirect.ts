"use client";

import { useRouter } from "next/navigation";

// Visitors can browse Learn and Predictions; acting sends them to sign in
// and back here.
export function useRequireAuthRedirect(signedIn: boolean, next: string) {
  const router = useRouter();
  return (fn: () => void | Promise<void>) => {
    if (!signedIn) {
      router.push(`/login?next=${encodeURIComponent(next)}`);
      return;
    }
    void fn();
  };
}
