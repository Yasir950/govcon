"use client";

import { useState } from "react";
import { updateMetricOverrideAction } from "./actions";
import { useToast } from "@/components/toast-provider";

interface MetricRow {
  metricKey: string;
  label: string;
  liveCount: number;
  overrideValue: number | null;
}

export function MetricsForm({ metrics }: { metrics: MetricRow[] }) {
  const showToast = useToast();
  const [values, setValues] = useState<Record<string, string>>(
    Object.fromEntries(metrics.map((m) => [m.metricKey, m.overrideValue?.toString() ?? ""])),
  );
  const [saving, setSaving] = useState<string | null>(null);

  async function save(metricKey: string) {
    setSaving(metricKey);
    const raw = values[metricKey]?.trim();
    const result = await updateMetricOverrideAction(metricKey, raw ? Number(raw) : null);
    setSaving(null);
    if (result.error) {
      showToast(result.error);
      return;
    }
    showToast("Saved");
  }

  return (
    <div>
      {metrics.map((m) => (
        <div className="admin-row" key={m.metricKey}>
          <div>
            <div className="admin-row-title">{m.label}</div>
            <div className="admin-row-meta">Live count: {m.liveCount.toLocaleString()}</div>
          </div>
          <div className="admin-row-actions">
            <input
              className="field"
              type="number"
              placeholder="Override (blank = live count)"
              style={{ width: 220 }}
              value={values[m.metricKey] ?? ""}
              onChange={(e) => setValues((v) => ({ ...v, [m.metricKey]: e.target.value }))}
            />
            <button className="btn btn-primary btn-sm" disabled={saving === m.metricKey} onClick={() => save(m.metricKey)}>
              Save
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}
