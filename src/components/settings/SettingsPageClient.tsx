"use client";

import Link from "next/link";
import { useActionState, useState, useTransition } from "react";
import { RewardsSettingsCard } from "@/components/points/RewardsSettingsCard";
import {
  changePasswordAction,
  updateMarketingConsentAction,
  updateProfileNameAction,
  uploadAvatarAction,
} from "@/app/(app)/settings/actions";
import { initialSettingsState } from "@/app/(app)/settings/settings-types";
import { toneFor } from "@/lib/avatar-tone";
import { PASSWORD_HINT } from "@/lib/password-rules";
import { LocationAutocomplete } from "@/components/LocationAutocomplete";
import { useToast } from "@/components/toast-provider";
import type { Viewer } from "@/lib/supabase/viewer";

const TABS = [
  ["profile", "Profile"],
  ["notifications", "Notifications"],
  ["rewards", "Rewards"],
  ["security", "Security"],
] as const;

export function SettingsPageClient({
  viewer,
  email,
  marketingConsent,
  initialTab = "profile",
}: {
  viewer: Viewer;
  email: string;
  marketingConsent: boolean;
  initialTab?: "profile" | "rewards";
}) {
  const showToast = useToast();
  // /settings?tab=rewards (linked from the Rewards page) opens that tab.
  const [tab, setTab] = useState<(typeof TABS)[number][0]>(initialTab);
  const [avatarUrl, setAvatarUrl] = useState(viewer.avatarUrl ?? null);
  const fullName = `${viewer.firstName} ${viewer.lastName}`.trim() || "Member";
  const initials = (`${viewer.firstName[0] ?? ""}${viewer.lastName[0] ?? ""}`.toUpperCase() || "GC") as string;

  const [nameState, nameAction, namePending] = useActionState(updateProfileNameAction, initialSettingsState);
  const [passwordState, passwordAction, passwordPending] = useActionState(
    changePasswordAction,
    initialSettingsState,
  );

  async function handleAvatarChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const formData = new FormData();
    formData.set("avatar", file);
    const result = await uploadAvatarAction(formData);
    if (result.error) {
      showToast(result.error);
      return;
    }
    if (result.url) setAvatarUrl(result.url);
    showToast("Profile photo updated");
  }

  const [consent, setConsent] = useState(marketingConsent);
  const [, startTransition] = useTransition();
  function toggleConsent() {
    const next = !consent;
    setConsent(next);
    startTransition(async () => {
      await updateMarketingConsentAction(next);
      showToast(next ? "Marketing emails turned on" : "Marketing emails turned off");
    });
  }

  return (
    <section className="main" id="settings">
      <div className="wrap">
        <div className="opps-app">
          <div className="page-head">
            <div>
              <h1>Account Settings</h1>
              <p>Manage your profile, notifications, and account security.</p>
            </div>
          </div>

          <div className="tabs">
            {TABS.map(([key, label]) => (
              <button key={key} className={`tab${tab === key ? " active" : ""}`} onClick={() => setTab(key)}>
                {label}
              </button>
            ))}
          </div>

          {tab === "rewards" && <RewardsSettingsCard />}

          {tab === "profile" && (
            <section className="card panel" style={{ maxWidth: 560 }}>
              <h2 className="section-title" style={{ marginBottom: 14 }}>
                Profile
              </h2>

              <div style={{ display: "flex", alignItems: "center", gap: 16, marginBottom: 20 }}>
                {avatarUrl ? (
                  <img
                    className="person-avatar-round lg"
                    src={avatarUrl}
                    alt={fullName}
                    style={{ width: 72, height: 72 }}
                  />
                ) : (
                  <span
                    className="company-logo-avatar lg"
                    data-tone={toneFor(fullName)}
                    role="img"
                    aria-label={fullName}
                    style={{ width: 72, height: 72, borderRadius: "50%", fontSize: "1.2rem" }}
                  >
                    {initials}
                  </span>
                )}
                <label className="btn btn-outline" style={{ cursor: "pointer" }}>
                  Change Photo
                  <input type="file" accept="image/*" onChange={handleAvatarChange} style={{ display: "none" }} />
                </label>
              </div>

              {nameState.error && <div className="auth-error">{nameState.error}</div>}
              {nameState.success && <div className="auth-success">Profile updated.</div>}
              <form action={nameAction} className="form-grid" style={{ marginTop: 12 }}>
                <label className="label">
                  First name
                  <input className="field" name="firstName" defaultValue={viewer.firstName} required />
                </label>
                <label className="label">
                  Last name
                  <input className="field" name="lastName" defaultValue={viewer.lastName} required />
                </label>
                <label className="label">
                  Job title
                  <input
                    className="field"
                    name="jobTitle"
                    placeholder="e.g. Business Development Manager"
                    defaultValue={viewer.jobTitle ?? ""}
                  />
                </label>
                <label className="label">
                  Location
                  <LocationAutocomplete name="location" defaultValue={viewer.location ?? ""} placeholder="e.g. Washington, DC" />
                </label>
                <label className="label" style={{ gridColumn: "1/-1" }}>
                  Company
                  <input className="field" name="companyName" placeholder="e.g. Adams Solutions, LLC" defaultValue={viewer.companyName ?? ""} />
                </label>
                <label className="label" style={{ gridColumn: "1/-1" }}>
                  Email
                  <input className="field" value={email} disabled />
                </label>
                <div style={{ gridColumn: "1/-1" }}>
                  <button className="btn btn-primary" type="submit" disabled={namePending}>
                    {namePending ? "Saving…" : "Save Changes"}
                  </button>
                </div>
              </form>
            </section>
          )}

          {tab === "notifications" && (
            <section className="card panel" style={{ maxWidth: 520 }}>
              <h2 className="section-title" style={{ marginBottom: 6 }}>
                Notifications
              </h2>
              <div className="setting-row">
                <div>
                  <strong>Marketing emails</strong>
                  <p className="meta" style={{ margin: "3px 0 0" }}>
                    Product updates, tips, and GovConUnited news.
                  </p>
                </div>
                <button
                  className={`toggle${consent ? " on" : ""}`}
                  role="switch"
                  aria-checked={consent}
                  aria-label="Marketing emails"
                  onClick={toggleConsent}
                >
                  <span />
                </button>
              </div>
              <div className="setting-row" style={{ marginTop: 14 }}>
                <div>
                  <strong>Notification preferences</strong>
                  <p className="meta" style={{ margin: "3px 0 0" }}>
                    Choose what you get notified about, in-app and by email.
                  </p>
                </div>
                <Link href="/settings/notifications" className="btn btn-outline btn-sm">
                  Manage
                </Link>
              </div>
              <div className="setting-row" style={{ marginTop: 14 }}>
                <div>
                  <strong>Messaging settings</strong>
                  <p className="meta" style={{ margin: "3px 0 0" }}>
                    Set an away message for when you're not around.
                  </p>
                </div>
                <Link href="/settings/messages" className="btn btn-outline btn-sm">
                  Manage
                </Link>
              </div>
            </section>
          )}

          {tab === "security" && (
            <section className="card panel" style={{ maxWidth: 520 }}>
              <h2 className="section-title" style={{ marginBottom: 14 }}>
                Change Password
              </h2>
              {passwordState.error && <div className="auth-error">{passwordState.error}</div>}
              {passwordState.success && <div className="auth-success">Password updated.</div>}
              <form action={passwordAction} style={{ display: "grid", gap: 13 }}>
                <label className="label">
                  Current password
                  <input className="field" name="currentPassword" type="password" autoComplete="current-password" required />
                </label>
                <label className="label">
                  New password
                  <input className="field" name="password" type="password" autoComplete="new-password" required />
                </label>
                <div className="auth-password-hint" style={{ margin: 0 }}>
                  {PASSWORD_HINT}
                </div>
                <label className="label">
                  Confirm new password
                  <input className="field" name="confirmPassword" type="password" autoComplete="new-password" required />
                </label>
                <div>
                  <button className="btn btn-primary" type="submit" disabled={passwordPending}>
                    {passwordPending ? "Updating…" : "Update Password"}
                  </button>
                </div>
              </form>
            </section>
          )}
        </div>
      </div>
    </section>
  );
}
