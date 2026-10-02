"use client";

import { useEffect, useState } from "react";
import { fetchActiveBoostIdsAction } from "@/app/(app)/rewards/actions";

// Active Credits-store boosts ("Featured listing", "Company boost",
// "Profile boost") for client lists that label them "Boosted".
export function useActiveBoosts(kind: "profile" | "company" | "listing") {
  const [ids, setIds] = useState<Set<string>>(new Set());
  useEffect(() => {
    let cancelled = false;
    fetchActiveBoostIdsAction(kind).then((list) => {
      if (!cancelled) setIds(new Set(list));
    });
    return () => {
      cancelled = true;
    };
  }, [kind]);
  return ids;
}
