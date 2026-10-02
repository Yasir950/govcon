import { createClient } from "@/lib/supabase/server";
import { NoticeForm } from "./NoticeForm";
import { NoticesList } from "./NoticesList";

export const dynamic = "force-dynamic";

export default async function AdminNoticesPage() {
  const supabase = await createClient();
  const { data: notices, error } = await supabase.from("notices").select("*").order("created_at", { ascending: false });
  if (error) throw error;

  return (
    <div>
      <div className="page-head">
        <div>
          <h1>Notices</h1>
          <p>A slim site-wide announcement banner, shown while published and not yet past its end date.</p>
        </div>
      </div>

      <NoticeForm />

      <NoticesList notices={notices ?? []} />
    </div>
  );
}
