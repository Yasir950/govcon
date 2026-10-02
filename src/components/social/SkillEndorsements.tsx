"use client";

import { useState } from "react";
import { Check, Plus } from "lucide-react";
import { Avatar } from "@/components/avatar";
import { useToast } from "@/components/toast-provider";
import { setSkillEndorsementAction } from "@/app/(app)/rewards/social-actions";
import type { ProfileSkillEndorsements, SkillEndorsement } from "@/lib/team-social-types";

// Skills & Capabilities on a member profile, with one-tap endorsements for
// the member's connections. Falls back to plain tags if endorsements
// couldn't load.
export function SkillEndorsements({
  profileId,
  skills,
  initial,
}: {
  profileId: string;
  skills: string[];
  initial: ProfileSkillEndorsements | null;
}) {
  const showToast = useToast();
  const [items, setItems] = useState<SkillEndorsement[]>(
    initial?.skills ?? skills.map((skill) => ({ skill, count: 0, endorsed: false, endorsers: [] })),
  );
  const [busy, setBusy] = useState<string | null>(null);
  const canEndorse = initial?.can_endorse ?? false;

  const toggle = async (s: SkillEndorsement) => {
    setBusy(s.skill);
    const res = await setSkillEndorsementAction(profileId, s.skill, !s.endorsed);
    setBusy(null);
    if (!res.ok) {
      showToast(res.error);
      return;
    }
    if (res.data) {
      const { endorsed, count } = res.data;
      setItems((cur) => cur.map((x) => (x.skill === s.skill ? { ...x, endorsed, count } : x)));
    }
  };

  return (
    <section className="card panel">
      <h2 className="section-title">Skills &amp; Capabilities</h2>
      {canEndorse && <p className="meta" style={{ margin: "4px 0 0" }}>Know their work? Endorse the skills you&apos;ve seen firsthand.</p>}
      <ul className="social-skill-list">
        {items.map((s) => (
          <li key={s.skill} className="social-skill">
            <span className="social-skill-name">
              {s.skill}
              {s.count > 0 && <span className="social-skill-count">{s.count}</span>}
            </span>
            {s.endorsers.length > 0 && (
              <span className="social-skill-endorsers" title={s.endorsers.map((e) => e.name).join(", ")}>
                {s.endorsers.map((e) => (
                  <Avatar key={e.id} name={e.name} avatarUrl={e.avatar_url} size={20} />
                ))}
              </span>
            )}
            {canEndorse && (
              <button
                type="button"
                className={`social-endorse${s.endorsed ? " is-on" : ""}`}
                aria-pressed={s.endorsed}
                disabled={busy !== null}
                onClick={() => toggle(s)}
              >
                {s.endorsed ? <Check size={13} aria-hidden="true" /> : <Plus size={13} aria-hidden="true" />}
                {s.endorsed ? "Endorsed" : "Endorse"}
              </button>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}
