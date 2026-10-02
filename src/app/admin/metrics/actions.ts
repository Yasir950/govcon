"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getViewer } from "@/lib/supabase/viewer";

export type MetricActionResult = { error?: string };

// Overrides the displayed number for a platform-metric proof point without
// ever hardcoding it in markup — null clears the override and the metric
// falls back to its real live count (see getPlatformMetrics).
export async function updateMetricOverrideAction(
  metricKey: string,
  overrideValue: number | null,
): Promise<MetricActionResult> {
  const viewer = await getViewer();
  if (!viewer?.isAdmin) return { error: "Admin access required." };

  const supabase = await createClient();
  const { error } = await supabase
    .from("platform_metrics")
    .update({ override_value: overrideValue })
    .eq("metric_key", metricKey);
  if (error) return { error: "Couldn't save that metric. Please try again." };

  revalidatePath("/admin/metrics");
  revalidatePath("/");
  return {};
}
