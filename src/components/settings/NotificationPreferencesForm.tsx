"use client";

import { useState } from "react";
import { updateNotificationPreferencesAction, type NotificationPreferences } from "@/app/(app)/settings/notifications/actions";
import { useToast } from "@/components/toast-provider";

interface Row {
  category: string;
  label: string;
  description: string;
}

interface Group {
  title: string;
  icon: string;
  rows: Row[];
}

const GROUPS: Group[] = [
  {
    title: "Account",
    icon: "i-user",
    rows: [
      { category: "account", label: "Account & welcome", description: "Setup tips and important account updates." },
      { category: "security", label: "Security", description: "New sign-ins and other account security alerts." },
    ],
  },
  {
    title: "Network & messages",
    icon: "i-users",
    rows: [
      { category: "connections", label: "Connections, follows & reviews", description: "Someone connects with or follows you or your company, reviews your company, or responds to your review." },
      {
        category: "following",
        label: "People & companies you follow",
        description: "New posts and comments from your connections and people you follow, and new posts, jobs, and opportunities from companies you follow.",
      },
      { category: "messages", label: "Messages", description: "New direct messages from other members." },
    ],
  },
  {
    title: "Posts & comments",
    icon: "i-message",
    rows: [{ category: "posts", label: "Post likes, comments & replies", description: "Activity on posts you've made, commented on, or follow." }],
  },
  {
    title: "Events & opportunities",
    icon: "i-calendar",
    rows: [
      { category: "events", label: "Events & invitations", description: "Invitations and reminders for upcoming events." },
      { category: "opportunities", label: "Opportunity alerts", description: "New opportunities matching your interests." },
      { category: "jobs", label: "Job applications", description: "Updates on jobs you've applied to." },
      {
        category: "teaming",
        label: "Teaming & member help",
        description: "Teaming inquiries and board matches, mentoring, capability statement reviews and contract wins.",
      },
    ],
  },
  {
    title: "Business",
    icon: "i-shield",
    rows: [
      { category: "billing", label: "Billing", description: "Receipts, plan changes, and payment issues." },
      { category: "moderation", label: "Moderation", description: "Actions taken on your posts or community." },
    ],
  },
  {
    title: "Rewards",
    icon: "i-chart",
    rows: [
      {
        category: "rewards",
        label: "Points, badges & streaks",
        description:
          "XP, Rep and Credits earned or adjusted, badges, level-ups, daily streaks, reminders, weekly recaps and season updates. Learning and teaming rewards are included.",
      },
    ],
  },
];

function Toggle({
  checked,
  onChange,
  label,
  disabled = false,
}: {
  checked: boolean;
  onChange: () => void;
  label: string;
  disabled?: boolean;
}) {
  return (
    <label className="pref-toggle" aria-label={label} style={disabled ? { opacity: 0.55, cursor: "not-allowed" } : undefined}>
      <input type="checkbox" checked={checked} onChange={onChange} disabled={disabled} />
      <span className="pref-toggle-track" aria-hidden="true">
        <span className="pref-toggle-thumb" />
      </span>
    </label>
  );
}

function GroupIcon({ icon }: { icon: string }) {
  return (
    <span className="pref-group-icon">
      <svg className="icon icon-sm" aria-hidden="true">
        <use href={`#${icon}`} />
      </svg>
    </span>
  );
}

export function NotificationPreferencesForm({ initialPreferences }: { initialPreferences: NotificationPreferences }) {
  const showToast = useToast();
  const [prefs, setPrefs] = useState(initialPreferences);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);

  function toggle(key: keyof NotificationPreferences) {
    setPrefs((prev) => ({ ...prev, [key]: !prev[key] }));
    setDirty(true);
  }

  async function save() {
    setSaving(true);
    const result = await updateNotificationPreferencesAction(prefs);
    setSaving(false);
    if (!result.error) setDirty(false);
    showToast(result.error ?? "Preferences saved");
  }

  return (
    <section className="main" id="notification-settings">
      <div className="wrap">
        <div className="opps-app">
          <div className="page-head">
            <div>
              <h1>Notification Preferences</h1>
              <p>Choose what you get notified about. Every in-app notification is also sent to your email.</p>
            </div>
          </div>

          <div className="card panel pref-card">
            <div className="pref-col-head">
              <span />
              <span className="pref-col-label">In-app</span>
              <span className="pref-col-label">Email</span>
            </div>

            {GROUPS.map((group) => (
              <div className="pref-group" key={group.title}>
                <div className="pref-group-title">
                  <GroupIcon icon={group.icon} />
                  {group.title}
                </div>
                {group.rows.map((row) => {
                  const inAppKey = `${row.category}_in_app` as keyof NotificationPreferences;
                  return (
                    <div className="pref-row" key={row.category}>
                      <div className="pref-row-copy">
                        <strong>{row.label}</strong>
                        <span className="meta">{row.description}</span>
                      </div>
                      <Toggle checked={prefs[inAppKey]} onChange={() => toggle(inAppKey)} label={`${row.label} — in-app`} />
                      {/* Email mirrors in-app: every notification a member receives is also emailed. */}
                      <Toggle checked={prefs[inAppKey]} onChange={() => {}} label={`${row.label} — email (follows in-app)`} disabled />
                    </div>
                  );
                })}
              </div>
            ))}

            <div className="pref-footer">
              <span className="meta">{dirty ? "You have unsaved changes." : "Everything's up to date."}</span>
              <button className="btn btn-primary" disabled={saving || !dirty} onClick={save}>
                {saving ? "Saving…" : "Save Preferences"}
              </button>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
