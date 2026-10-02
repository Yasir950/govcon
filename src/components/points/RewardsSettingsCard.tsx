"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowRight, Bell, Check, Clock, EyeOff, Loader2, Palette, type LucideIcon } from "lucide-react";
import { useToast } from "@/components/toast-provider";
import { usePoints } from "@/components/points/PointsProvider";
import { setRewardsPreferencesAction, type RewardsPreferences } from "@/app/(app)/rewards/actions";
import { PROFILE_FRAMES, PROFILE_THEMES } from "@/lib/points-types";

const US_ZONES = [
  "America/New_York",
  "America/Chicago",
  "America/Denver",
  "America/Phoenix",
  "America/Los_Angeles",
  "America/Anchorage",
  "Pacific/Honolulu",
];

const REMINDERS: { key: keyof RewardsPreferences; summaryKey: keyof NonNullable<ReturnType<typeof usePoints>["summary"]>["notify"]; label: string; description: string; channel: string }[] = [
  { key: "notify_streak_risk", summaryKey: "streak_risk", label: "Streak at risk", description: "5 pm on a workday with no streak activity yet.", channel: "Email" },
  { key: "notify_quests_ready", summaryKey: "quests_ready", label: "New quests ready", description: "8 am on workdays.", channel: "In-app" },
  { key: "notify_weekly_recap", summaryKey: "weekly_recap", label: "Weekly recap", description: "Monday 8 am: last week's XP, Rep, rank change and this week's challenge.", channel: "Email" },
  { key: "notify_rep", summaryKey: "rep", label: "Someone gave you Rep", description: "Batched: at most 1 notification an hour.", channel: "In-app" },
  { key: "notify_leaderboard", summaryKey: "leaderboard", label: "Leaderboard movement", description: "When you enter this week's top 10.", channel: "In-app" },
  { key: "notify_season", summaryKey: "season", label: "Season ending", description: "7 days and 1 day before a season ends.", channel: "In-app + email" },
];

function SectionHead({ icon: Icon, title, children }: { icon: LucideIcon; title: string; children?: React.ReactNode }) {
  return (
    <div className="rs-section-head">
      <span className="rs-section-icon" aria-hidden>
        <Icon size={16} />
      </span>
      <div>
        <h3>{title}</h3>
        {children && <p>{children}</p>}
      </div>
    </div>
  );
}

function Switch({ on, label, disabled, onChange }: { on: boolean; label: string; disabled: boolean; onChange: (next: boolean) => void }) {
  return (
    <button type="button" className={`toggle${on ? " on" : ""}`} role="switch" aria-checked={on} aria-label={label} disabled={disabled} onClick={() => onChange(!on)}>
      <span />
    </button>
  );
}

// Settings → Rewards: the member's day boundary (time zone), leaderboard
// privacy, rewards reminders, and unlocked profile theme/frame. Every
// control saves on change; the header shows the autosave state.
export function RewardsSettingsCard() {
  const { summary, setSummary } = usePoints();
  const showToast = useToast();
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const [savedField, setSavedField] = useState<"theme" | "frame" | null>(null);
  const savedTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const zones = useMemo(() => {
    const all = typeof Intl.supportedValuesOf === "function" ? Intl.supportedValuesOf("timeZone") : [];
    return [...US_ZONES, ...all.filter((z) => !US_ZONES.includes(z))];
  }, []);

  // The store's "Owned · Apply" links to #profile-look; the card renders
  // after the summary loads, so the browser's own jump would miss it.
  const loaded = !!summary;
  useEffect(() => {
    if (loaded && window.location.hash === "#profile-look") document.getElementById("profile-look")?.scrollIntoView({ block: "start" });
  }, [loaded]);
  useEffect(() => () => {
    if (savedTimer.current) clearTimeout(savedTimer.current);
  }, []);

  if (!summary) return <section className="card panel rs-card"><p className="meta">Loading…</p></section>;

  const save = async (prefs: RewardsPreferences, message: string | null = "Saved") => {
    setSaving(true);
    const res = await setRewardsPreferencesAction(prefs);
    setSaving(false);
    if (res.ok && res.data) {
      setSummary(res.data);
      setSavedAt(Date.now());
      if (message) showToast(message);
      return true;
    }
    if (!res.ok) showToast(res.error);
    return false;
  };

  // Theme and frame confirm inline with a small "Saved" next to the field.
  const saveLook = async (field: "theme" | "frame", prefs: RewardsPreferences) => {
    if (!(await save(prefs, null))) return;
    setSavedField(field);
    if (savedTimer.current) clearTimeout(savedTimer.current);
    savedTimer.current = setTimeout(() => setSavedField(null), 2500);
  };

  // Only owned themes/frames are offered (plus Default/None). The applied one
  // is always listed, even if it somehow isn't in the owned list.
  const withApplied = (owned: string[] | undefined, applied: string | null, known: Record<string, unknown>) =>
    Object.keys(known).filter((v) => (owned ?? []).includes(v) || v === applied);
  const themeChoices = withApplied(summary.owned_cosmetics?.themes, summary.profile_theme, PROFILE_THEMES);
  const frameChoices = withApplied(summary.owned_cosmetics?.frames, summary.profile_frame, PROFILE_FRAMES);
  const theme = summary.profile_theme ? PROFILE_THEMES[summary.profile_theme] : undefined;
  const frame = summary.profile_frame ? PROFILE_FRAMES[summary.profile_frame] : undefined;

  return (
    <section className="card panel rs-card" id="rewards">
      <div className="rs-head">
        <div>
          <h2 className="section-title">Rewards</h2>
          <p className="meta">
            Daily quests, caps and streaks run midnight to midnight in your time zone.{" "}
            <Link href="/rewards?tab=how" className="rs-link">
              How points work <ArrowRight size={13} />
            </Link>
          </p>
        </div>
        <span className={`rs-autosave${saving ? " is-saving" : savedAt ? " is-saved" : ""}`} aria-live="polite">
          {saving ? <Loader2 size={13} className="spin" /> : <Check size={13} />}
          {saving ? "Saving…" : savedAt ? "All changes saved" : "Changes save automatically"}
        </span>
      </div>

      <div className="rs-section">
        <SectionHead icon={Clock} title="Time zone">
          Sets when your day, quests and streaks reset.
        </SectionHead>
        <select className="points-select" value={summary.timezone} disabled={saving} aria-label="Time zone" onChange={(e) => save({ timezone: e.target.value }, "Time zone updated")}>
          {zones.map((z) => (
            <option key={z} value={z}>
              {z.replace(/_/g, " ")}
            </option>
          ))}
        </select>
      </div>

      <div className="rs-section">
        <SectionHead icon={EyeOff} title="Privacy" />
        <div className="rs-row">
          <div>
            <strong>Hide me from public leaderboards</strong>
            <span>You still earn everything and see your own rank.</span>
          </div>
          <Switch on={summary.leaderboard_opt_out} label="Hide me from public leaderboards" disabled={saving} onChange={(v) => save({ leaderboard_opt_out: v })} />
        </div>
      </div>

      <div className="rs-section">
        <SectionHead icon={Bell} title="Reminders">
          Turn all rewards notifications off in{" "}
          <Link href="/settings/notifications" className="rs-link">
            Notification Preferences <ArrowRight size={13} />
          </Link>
        </SectionHead>
        <div className="rs-rows">
          {REMINDERS.map((r) => (
            <div key={r.key} className="rs-row">
              <div>
                <strong>
                  {r.label} <em className="rs-channel">{r.channel}</em>
                </strong>
                <span>{r.description}</span>
              </div>
              <Switch
                on={summary.notify[r.summaryKey]}
                label={r.label}
                disabled={saving}
                onChange={(v) => save({ [r.key]: v } as RewardsPreferences)}
              />
            </div>
          ))}
        </div>
      </div>

      <div className="rs-section" id="profile-look">
        <SectionHead icon={Palette} title="Profile look">
          Colors the header behind your name and photo, for everyone who views your profile.
        </SectionHead>

        <div className="rs-look">
          <div className="rs-look-field">
            <label className="rs-label" htmlFor="rs-theme">
              Theme
            </label>
            <div className="rs-look-control">
              <span className="rs-look-preview" style={theme ? { background: theme.swatch } : undefined} aria-hidden />
              <select
                id="rs-theme"
                className="points-select"
                value={summary.profile_theme ?? ""}
                disabled={saving}
                onChange={(e) => saveLook("theme", { profile_theme: e.target.value || null })}
              >
                <option value="">Default</option>
                {themeChoices.map((v) => (
                  <option key={v} value={v}>
                    {PROFILE_THEMES[v].label}
                  </option>
                ))}
              </select>
            </div>
            <span className="rs-look-saved" aria-live="polite">
              {savedField === "theme" && (
                <>
                  <Check size={13} /> Saved
                </>
              )}
            </span>
          </div>

          <div className="rs-look-field">
            <label className="rs-label" htmlFor="rs-frame">
              Banner frame
            </label>
            <div className="rs-look-control">
              <span className="rs-look-preview is-frame" style={frame ? { borderColor: frame.color } : undefined} aria-hidden />
              <select
                id="rs-frame"
                className="points-select"
                value={summary.profile_frame ?? ""}
                disabled={saving}
                onChange={(e) => saveLook("frame", { profile_frame: e.target.value || null })}
              >
                <option value="">None</option>
                {frameChoices.map((v) => (
                  <option key={v} value={v}>
                    {PROFILE_FRAMES[v].label}
                  </option>
                ))}
              </select>
            </div>
            <span className="rs-look-saved" aria-live="polite">
              {savedField === "frame" && (
                <>
                  <Check size={13} /> Saved
                </>
              )}
            </span>
          </div>
        </div>

        <p className="rs-look-hint">
          Classic Navy, Capitol Red and Evergreen unlock free at Level 4 (Subcontractor). Midnight, Sunrise and banner frames are in the{" "}
          <Link href="/rewards?tab=store" className="rs-link">
            Credits store <ArrowRight size={13} />
          </Link>
        </p>
      </div>
    </section>
  );
}
