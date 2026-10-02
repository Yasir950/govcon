"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Avatar } from "@/components/avatar";
import { useToast } from "@/components/toast-provider";
import type { HelpResult } from "@/app/(app)/teaming/actions";
import { rewardText, type HelpPerson, type HelpRule } from "@/lib/member-help-types";

// Runs a member-help action: toasts the outcome and refreshes the server
// data on success. Returns whether it worked.
export function useHelpAction() {
  const router = useRouter();
  const showToast = useToast();
  const [busy, setBusy] = useState(false);
  const run = async <T,>(fn: () => Promise<HelpResult<T>>): Promise<boolean> => {
    setBusy(true);
    try {
      const res = await fn();
      if (!res.ok) {
        showToast(res.error);
        return false;
      }
      if (res.message) showToast(res.message);
      router.refresh();
      return true;
    } finally {
      setBusy(false);
    }
  };
  return { run, busy };
}

export function profileHref(p: HelpPerson) {
  return `/network/${p.slug ?? p.id}`;
}

export function PersonLine({ person, sub }: { person: HelpPerson; sub?: React.ReactNode }) {
  return (
    <div className="help-person">
      <Link href={profileHref(person)} aria-hidden="true" tabIndex={-1}>
        <Avatar name={person.name} avatarUrl={person.avatar_url} size={38} />
      </Link>
      <div className="help-person-text">
        <Link href={profileHref(person)} className="help-person-name">
          {person.name}
        </Link>
        <span className="meta">
          {[person.headline || person.company, `Level ${person.level} · ${person.rank}`].filter(Boolean).join(" · ")}
        </span>
        {sub && <span className="meta">{sub}</span>}
      </div>
    </div>
  );
}

export function RewardChip({ rule, prefix }: { rule: HelpRule | null | undefined; prefix?: string }) {
  const text = rewardText(rule);
  if (!text) return null;
  return (
    <span className="points-quest-reward help-reward">
      {prefix ? `${prefix} ` : ""}
      {text}
    </span>
  );
}

export function timeAgo(iso: string) {
  const s = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 3600) return `${Math.max(1, Math.round(s / 60))}m ago`;
  if (s < 86400) return `${Math.round(s / 3600)}h ago`;
  if (s < 86400 * 30) return `${Math.round(s / 86400)}d ago`;
  return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

export function formatDay(day: string) {
  // Plain dates (YYYY-MM-DD) are calendar days, not instants.
  const [y, m, d] = day.slice(0, 10).split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

export function EmptyState({ children }: { children: React.ReactNode }) {
  return <p className="help-empty meta">{children}</p>;
}
