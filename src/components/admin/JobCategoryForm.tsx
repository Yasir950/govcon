"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { upsertJobCategoryAction } from "@/app/admin/job-categories/actions";
import { useToast } from "@/components/toast-provider";

export function JobCategoryForm({
  id,
  initialValues,
  redirectTo,
}: {
  id: string | null;
  initialValues: { title: string; description: string; sortOrder: number };
  redirectTo: string;
}) {
  const router = useRouter();
  const showToast = useToast();
  const [title, setTitle] = useState(initialValues.title);
  const [description, setDescription] = useState(initialValues.description);
  const [sortOrder, setSortOrder] = useState(String(initialValues.sortOrder));
  const [saving, setSaving] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim() || !description.trim()) {
      showToast("Title and description are required.");
      return;
    }
    setSaving(true);
    const result = await upsertJobCategoryAction(id, { title, description, sortOrder: Number(sortOrder) || 0 });
    setSaving(false);
    if (result.error) {
      showToast(result.error);
      return;
    }
    showToast(id ? "Saved" : "Created");
    router.push(redirectTo);
    router.refresh();
  }

  return (
    <form onSubmit={handleSubmit} className="card panel" style={{ display: "grid", gap: 14, maxWidth: 640 }}>
      <label className="label">
        Title *
        <input className="field" value={title} onChange={(e) => setTitle(e.target.value)} />
      </label>
      <label className="label">
        Description *
        <textarea className="textarea" value={description} onChange={(e) => setDescription(e.target.value)} />
      </label>
      <label className="label">
        Sort order
        <input className="field" type="number" value={sortOrder} onChange={(e) => setSortOrder(e.target.value)} />
      </label>
      <div style={{ display: "flex", gap: 10 }}>
        <button className="btn btn-primary" type="submit" disabled={saving}>
          {saving ? "Saving…" : id ? "Save changes" : "Create"}
        </button>
        <button className="btn btn-outline" type="button" onClick={() => router.push(redirectTo)}>
          Cancel
        </button>
      </div>
    </form>
  );
}
