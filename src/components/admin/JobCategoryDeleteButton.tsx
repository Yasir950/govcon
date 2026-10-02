"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { deleteJobCategoryAction } from "@/app/admin/job-categories/actions";
import { useToast } from "@/components/toast-provider";

export function JobCategoryDeleteButton({ id }: { id: string }) {
  const router = useRouter();
  const showToast = useToast();
  const [pending, setPending] = useState(false);

  async function handleDelete() {
    if (!confirm("Delete this permanently? This can't be undone.")) return;
    setPending(true);
    const result = await deleteJobCategoryAction(id);
    setPending(false);
    if (result.error) {
      showToast(result.error);
      return;
    }
    showToast("Deleted");
    router.refresh();
  }

  return (
    <button className="btn btn-outline btn-sm" style={{ color: "var(--o-red)", borderColor: "var(--o-red)" }} disabled={pending} onClick={handleDelete}>
      Delete
    </button>
  );
}
