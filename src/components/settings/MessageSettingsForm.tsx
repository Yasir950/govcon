"use client";

import { useState } from "react";
import Link from "next/link";
import { setAwayMessageAction } from "@/app/(app)/settings/messages/actions";
import { useToast } from "@/components/toast-provider";

export function MessageSettingsForm({
  isPro,
  initialEnabled,
  initialMessage,
}: {
  isPro: boolean;
  initialEnabled: boolean;
  initialMessage: string;
}) {
  const showToast = useToast();
  const [enabled, setEnabled] = useState(initialEnabled);
  const [message, setMessage] = useState(initialMessage);
  const [saving, setSaving] = useState(false);

  async function save(nextEnabled: boolean) {
    setSaving(true);
    const result = await setAwayMessageAction(nextEnabled, message);
    setSaving(false);
    if (result.error) {
      showToast(result.error);
      return;
    }
    setEnabled(nextEnabled);
    showToast(nextEnabled ? "Away message turned on" : "Away message turned off");
  }

  return (
    <section className="main" id="message-settings">
      <div className="wrap">
        <div className="opps-app">
          <div className="page-head">
            <div>
              <h1>Messaging Settings</h1>
              <p>Control how your messages behave when you're not around.</p>
            </div>
          </div>

          <div className="card panel" style={{ padding: 18, display: "grid", gap: 14, maxWidth: 560 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12 }}>
              <div>
                <strong>Away message</strong>
                <p className="meta" style={{ margin: "3px 0 0" }}>
                  Automatically let people know you're away when they message you.
                </p>
              </div>
              {!isPro && <span className="tag">Pro</span>}
            </div>

            {!isPro ? (
              <div className="card panel sidebar-plan-card" style={{ margin: 0 }}>
                <strong>Upgrade to set an away message</strong>
                <p>Away messages are a Pro feature. Upgrade your plan to let people know when you're unavailable.</p>
                <Link href="/billing" className="btn btn-primary btn-full">
                  Upgrade Now
                </Link>
              </div>
            ) : (
              <>
                <textarea
                  className="textarea"
                  placeholder="e.g. I'm traveling and will reply slower than usual this week."
                  value={message}
                  maxLength={280}
                  onChange={(e) => setMessage(e.target.value)}
                />
                <div style={{ display: "flex", gap: 8 }}>
                  {enabled ? (
                    <button className="btn btn-outline" disabled={saving} onClick={() => save(false)}>
                      Turn off
                    </button>
                  ) : (
                    <button className="btn btn-primary" disabled={saving || !message.trim()} onClick={() => save(true)}>
                      Turn on
                    </button>
                  )}
                  {enabled && (
                    <button className="btn btn-primary" disabled={saving || !message.trim()} onClick={() => save(true)}>
                      Save changes
                    </button>
                  )}
                </div>
                {enabled && <p className="meta">Currently on — people messaging you will see this note.</p>}
              </>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
