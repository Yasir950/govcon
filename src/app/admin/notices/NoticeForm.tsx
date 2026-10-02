"use client";

import { useActionState } from "react";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { createNoticeAction, type NoticeActionResult } from "./actions";

const initialState: NoticeActionResult = {};

export function NoticeForm() {
  const router = useRouter();
  const [state, formAction, pending] = useActionState(createNoticeAction, initialState);

  useEffect(() => {
    // useActionState returns the same initialState reference until a real
    // submission resolves, so this skips the mount-time render and only
    // refreshes the list after an actual successful create.
    if (state !== initialState && !state.error && !pending) {
      router.refresh();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state]);

  return (
    <form action={formAction} className="card panel" style={{ display: "grid", gap: 12, maxWidth: 640, marginBottom: 20 }}>
      <label className="label">
        Message *
        <textarea className="textarea" name="message" required />
      </label>
      <label className="label">
        Level
        <select className="select" name="level" defaultValue="info">
          <option value="info">Info</option>
          <option value="warning">Warning</option>
        </select>
      </label>
      <label className="label">
        Ends at (optional)
        <input className="field" type="datetime-local" name="ends_at" />
      </label>
      {state.error && <p style={{ color: "var(--o-red)" }}>{state.error}</p>}
      <button className="btn btn-primary" type="submit" disabled={pending}>
        {pending ? "Creating…" : "Create notice"}
      </button>
    </form>
  );
}
