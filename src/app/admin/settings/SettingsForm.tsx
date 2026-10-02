"use client";

import { useState } from "react";
import { updateSiteSettingAction } from "./actions";
import { useToast } from "@/components/toast-provider";

const LABELS: Record<string, string> = {
  social_facebook_url: "Facebook URL",
  social_x_url: "X (Twitter) URL",
  social_instagram_url: "Instagram URL",
  social_linkedin_url: "LinkedIn URL",
  app_store_url: "App Store listing URL",
  google_play_url: "Google Play listing URL",
};

export function SettingsForm({ settings }: { settings: { key: string; value: string | null }[] }) {
  const showToast = useToast();
  const [values, setValues] = useState<Record<string, string>>(
    Object.fromEntries(settings.map((s) => [s.key, s.value ?? ""])),
  );
  const [saving, setSaving] = useState<string | null>(null);

  async function save(key: string) {
    setSaving(key);
    const result = await updateSiteSettingAction(key, values[key] ?? "");
    setSaving(null);
    if (result.error) {
      showToast(result.error);
      return;
    }
    showToast("Saved");
  }

  return (
    <div>
      {settings.map((s) => (
        <div className="admin-row" key={s.key}>
          <div style={{ flex: 1 }}>
            <div className="admin-row-title">{LABELS[s.key] ?? s.key}</div>
            <input
              className="field"
              style={{ width: "100%", marginTop: 6 }}
              placeholder="Leave blank to hide this link on the site"
              value={values[s.key] ?? ""}
              onChange={(e) => setValues((v) => ({ ...v, [s.key]: e.target.value }))}
            />
          </div>
          <div className="admin-row-actions">
            <button className="btn btn-primary btn-sm" disabled={saving === s.key} onClick={() => save(s.key)}>
              Save
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}
