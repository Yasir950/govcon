"use client";

import Link from "next/link";
import { useState } from "react";
import { Cake, Check, PartyPopper } from "lucide-react";
import { Avatar } from "@/components/avatar";
import { useToast } from "@/components/toast-provider";
import { congratulateAction } from "@/app/(app)/rewards/social-actions";
import { rewardText } from "@/lib/member-help-types";
import { celebrationText, type NetworkCelebrations } from "@/lib/team-social-types";

// Home, right rail: connections with a new role or a work anniversary this
// month. One tap congratulates them.
export function CelebrationsCard({ initial }: { initial: NetworkCelebrations | null }) {
  const showToast = useToast();
  const [done, setDone] = useState<Set<string>>(new Set());
  const [busyKey, setBusyKey] = useState<string | null>(null);

  if (!initial || initial.items.length === 0) return null;
  const reward = rewardText(initial.rule);

  const congratulate = async (profileId: string, key: string) => {
    setBusyKey(key);
    const res = await congratulateAction(profileId, key);
    setBusyKey(null);
    if (!res.ok) {
      showToast(res.error);
      return;
    }
    setDone((cur) => new Set(cur).add(key));
  };

  return (
    <section className="card panel social-card" id="celebrations">
      <div className="panel-head">
        <h2 className="section-title">
          <PartyPopper size={16} aria-hidden="true" /> Celebrate your network
        </h2>
      </div>
      <ul className="social-list">
        {initial.items.map((c) => {
          const isDone = done.has(c.key);
          return (
            <li key={c.key} className="social-row">
              <Link href={`/network/${c.person.slug ?? c.person.id}`} className="social-row-person">
                <Avatar name={c.person.name} avatarUrl={c.person.avatar_url} size={32} />
                <span>
                  <span className="mini-row-title is-name">{c.person.name}</span>
                  <span className="meta">
                    {c.kind === "anniversary" && <Cake size={11} aria-hidden="true" />} {celebrationText(c)}
                  </span>
                </span>
              </Link>
              {isDone ? (
                <span className="social-done">
                  <Check size={13} aria-hidden="true" /> Sent
                </span>
              ) : (
                <button
                  type="button"
                  className="btn btn-outline btn-sm"
                  disabled={busyKey !== null}
                  onClick={() => congratulate(c.person.id, c.key)}
                >
                  Congratulate
                </button>
              )}
            </li>
          );
        })}
      </ul>
      {reward && (
        <p className="meta social-fineprint">
          {reward} each{initial.rule?.daily_cap ? `, up to ${initial.rule.daily_cap} a day (shared with win congratulations)` : ""}.
        </p>
      )}
    </section>
  );
}
