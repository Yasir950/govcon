"use client";

import { useEffect, useState } from "react";
import { resubmitResourceAction, submitResourceAction } from "@/app/(app)/resources/actions";
import { useToast } from "@/components/toast-provider";
import { createClient } from "@/lib/supabase/client";
import {
  fileExtension,
  MAX_PENDING_SUBMISSIONS,
  MAX_RESOURCE_FILE_BYTES,
  RESOURCE_FILE_ACCEPT,
  RESOURCE_FILE_TYPES,
  RESOURCE_SUMMARY_MAX,
  RESOURCE_TITLE_MAX,
  RESOURCE_TYPES,
  type ResourceCategory,
} from "@/lib/resources";

export interface SubmitResourceInitial {
  id: string;
  title: string;
  type: string;
  categoryId: string | null;
  description: string;
  kind: string;
  url: string | null;
}

// resource_types / resource_categories are readable by anyone, so the
// pickers load on open instead of holding up the page.
function useTaxonomy() {
  const [types, setTypes] = useState<string[]>(RESOURCE_TYPES);
  const [categories, setCategories] = useState<ResourceCategory[] | null>(null);
  useEffect(() => {
    const supabase = createClient();
    let live = true;
    Promise.all([
      supabase.from("resource_types").select("name").order("sort_order").order("name"),
      supabase.from("resource_categories").select("id, name").order("sort_order").order("name"),
    ]).then(([t, c]) => {
      if (!live) return;
      if (t.data?.length) setTypes(t.data.map((x) => x.name));
      setCategories(c.data ?? []);
    });
    return () => {
      live = false;
    };
  }, []);
  return { types, categories };
}

// New submission (viewerId set) or a resubmission after "Request changes"
// (initial set — the delivery kind can't change then).
export function SubmitResourceForm({
  viewerId,
  initial,
  onDone,
}: {
  viewerId: string;
  initial?: SubmitResourceInitial;
  onDone: () => void;
}) {
  const showToast = useToast();
  const { types, categories } = useTaxonomy();
  const [title, setTitle] = useState(initial?.title ?? "");
  const [type, setType] = useState(initial?.type ?? "Guide");
  const [categoryId, setCategoryId] = useState(initial?.categoryId ?? "");
  const [description, setDescription] = useState(initial?.description ?? "");
  const [kind, setKind] = useState<"link" | "file">(initial?.kind === "file" ? "file" : "link");
  const [url, setUrl] = useState(initial?.url ?? "");
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  function pickFile(f: File | null) {
    if (f && !fileExtension(f.name)) return showToast("Only PDF, DOCX, XLSX, PPTX, CSV and ZIP files are allowed.");
    if (f && f.size > MAX_RESOURCE_FILE_BYTES) return showToast("Files can be at most 25 MB.");
    setFile(f);
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!categoryId) return showToast("Pick a category.");

    if (initial) {
      setBusy("Sending…");
      const res = await resubmitResourceAction(initial.id, { title, type, categoryId, description, url });
      setBusy(null);
      if (!res.ok) return showToast(res.error ?? "Couldn't send that back for review.");
      showToast("Sent back for review.");
      return onDone();
    }

    let filePath: string | null = null;
    if (kind === "file") {
      if (!file) return showToast("Choose a file to upload.");
      const ext = fileExtension(file.name)!;
      filePath = `submissions/${viewerId}/${Date.now()}-${file.name.replace(/[^A-Za-z0-9._-]+/g, "-")}`;
      setBusy("Uploading…");
      const { error } = await createClient().storage.from("resource-files").upload(filePath, file, { contentType: RESOURCE_FILE_TYPES[ext] });
      if (error) {
        setBusy(null);
        return showToast(`Upload failed: ${error.message}`);
      }
      setBusy("Checking file…");
    } else setBusy("Submitting…");

    const res = await submitResourceAction({ title, type, categoryId, description, kind, url, filePath, fileName: file?.name ?? null });
    setBusy(null);
    if (!res.ok) return showToast(res.error ?? "Couldn't submit that resource.");
    showToast(res.warning ?? "Thanks! It's under review — you can follow it on your profile.");
    onDone();
  }

  return (
    <form className="stack" style={{ gap: 10 }} onSubmit={submit}>
      <label className="label">
        Title *
        <input className="field" value={title} required maxLength={RESOURCE_TITLE_MAX} onChange={(e) => setTitle(e.target.value)} />
      </label>
      <div className="resource-submit-row">
        <label className="label">
          Type
          <select className="field" value={type} onChange={(e) => setType(e.target.value)}>
            {types.map((t) => (
              <option key={t}>{t}</option>
            ))}
          </select>
        </label>
        <label className="label">
          Category *
          <select className="field" value={categoryId} required onChange={(e) => setCategoryId(e.target.value)} disabled={!categories}>
            <option value="">{categories ? "Select…" : "Loading…"}</option>
            {(categories ?? []).map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
        </label>
      </div>

      {!initial && (
        <div className="resource-submit-kind" role="radiogroup" aria-label="Link or file">
          <label>
            <input type="radio" name="kind" checked={kind === "link"} onChange={() => setKind("link")} /> Link
          </label>
          <label>
            <input type="radio" name="kind" checked={kind === "file"} onChange={() => setKind("file")} /> Upload a file
          </label>
        </div>
      )}
      {kind === "link" ? (
        <label className="label">
          Link *
          <input className="field" type="url" placeholder="https://" required value={url} onChange={(e) => setUrl(e.target.value)} />
        </label>
      ) : initial ? (
        <p className="meta" style={{ margin: 0 }}>The file you uploaded stays attached.</p>
      ) : (
        <label className="label">
          File *
          <input type="file" accept={RESOURCE_FILE_ACCEPT} required onChange={(e) => pickFile(e.target.files?.[0] ?? null)} />
          <small className="meta">PDF, DOCX, XLSX, PPTX, CSV or ZIP · up to 25 MB · virus-scanned</small>
        </label>
      )}

      <label className="label">
        Short description
        <textarea
          className="field"
          placeholder="What is it and who is it for?"
          rows={3}
          maxLength={RESOURCE_SUMMARY_MAX}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
        />
        <small className="meta">{description.length}/{RESOURCE_SUMMARY_MAX}</small>
      </label>
      <button className="btn btn-primary" disabled={!!busy}>
        {busy ?? (initial ? "Send back for review" : "Submit for review")}
      </button>
      {!initial && <p className="meta" style={{ margin: 0 }}>You can have up to {MAX_PENDING_SUBMISSIONS} submissions waiting for review at a time.</p>}
    </form>
  );
}
