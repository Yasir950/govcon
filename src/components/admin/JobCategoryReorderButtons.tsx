"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { swapJobCategorySortOrderAction } from "@/app/admin/job-categories/actions";
import { useToast } from "@/components/toast-provider";

export function JobCategoryReorderButtons({
  id,
  sortOrder,
  prev,
  next,
}: {
  id: string;
  sortOrder: number;
  prev: { id: string; sortOrder: number } | null;
  next: { id: string; sortOrder: number } | null;
}) {
  const router = useRouter();
  const showToast = useToast();
  const [pending, setPending] = useState(false);

  async function swap(other: { id: string; sortOrder: number }) {
    setPending(true);
    const result = await swapJobCategorySortOrderAction(id, sortOrder, other.id, other.sortOrder);
    setPending(false);
    if (result.error) {
      showToast(result.error);
      return;
    }
    router.refresh();
  }

  return (
    <div style={{ display: "flex", gap: 4 }}>
      <button
        type="button"
        className="btn btn-outline btn-sm"
        disabled={pending || !prev}
        onClick={() => prev && swap(prev)}
        aria-label="Move up"
      >
        ↑
      </button>
      <button
        type="button"
        className="btn btn-outline btn-sm"
        disabled={pending || !next}
        onClick={() => next && swap(next)}
        aria-label="Move down"
      >
        ↓
      </button>
    </div>
  );
}
