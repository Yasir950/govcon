import { createClient } from "@/lib/supabase/server";
import { SettingsForm } from "./SettingsForm";

export const dynamic = "force-dynamic";

export default async function AdminSettingsPage() {
  const supabase = await createClient();
  const { data: settings, error } = await supabase.from("site_settings").select("key, value").order("key");
  if (error) throw error;

  return (
    <div>
      <div className="page-head">
        <div>
          <h1>Site Settings</h1>
          <p>Social and app-store footer links. Blank hides the icon rather than linking to a placeholder.</p>
        </div>
      </div>
      <SettingsForm settings={settings ?? []} />
    </div>
  );
}
