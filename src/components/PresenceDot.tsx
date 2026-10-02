"use client";

import { useOnlinePresence } from "@/components/OnlinePresenceProvider";

// Drop-in online indicator for the single-avatar spots that live in a
// Server Component (which can't call the presence hook itself) — render
// this as a sibling of the avatar inside a position:relative wrapper.
export function PresenceDot({ memberId }: { memberId: string }) {
  const onlineIds = useOnlinePresence();
  if (!onlineIds.has(memberId)) return null;
  return <span className="online-dot" aria-label="Online" />;
}
