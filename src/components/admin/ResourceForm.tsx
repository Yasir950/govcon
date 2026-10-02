"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import {
  addResourceCategoryAction,
  addResourceTypeAction,
  adminResourceFileUrlAction,
  attachResourceFileAction,
  saveResourceAction,
  setResourceThumbnailAction,
} from "@/app/admin/resources/actions";
import { RichTextEditor } from "@/components/rich-text/RichTextEditor";
import { useToast } from "@/components/toast-provider";
import { createClient } from "@/lib/supabase/client";
import { pdfFirstPageThumbnail } from "@/lib/pdf-thumbnail";
import { slugBase } from "@/lib/slugify";
import {
  fileExtension,
  formatDuration,
  formatFileSize,
  MAX_RESOURCE_FILE_BYTES,
  RESOURCE_ACCESS_LEVELS,
  RESOURCE_FILE_ACCEPT,
  RESOURCE_FILE_TYPES,
  RESOURCE_KINDS,
  RESOURCE_SOURCE_MAX,
  RESOURCE_STATUSES,
  RESOURCE_SUMMARY_MAX,
  RESOURCE_TITLE_MAX,
  type ResourceAccess,
  type ResourceCategory,
  type ResourceKind,
  type ResourceStatus,
} from "@/lib/resources";

export interface ResourceFormInitial {
  title: string;
  slug: string;
  type: string;
  categoryId: string;
  description: string;
  body: string;
  tags: string;
  source: string;
  access: ResourceAccess;
  kind: ResourceKind;
  url: string;
  featured: boolean;
  status: ResourceStatus;
  scheduledAt: string | null;
  fileName: string | null;
  fileSize: number | null;
  fileUploadedAt: string | null;
  scanStatus: string | null;
  videoDurationSeconds: number | null;
  videoThumbnailUrl: string | null;
  thumbnailUrl: string | null;
  thumbnailAuto: boolean;
}

const EMPTY: ResourceFormInitial = {
  title: "",
  slug: "",
  type: "",
  categoryId: "",
  description: "",
  body: "",
  tags: "",
  source: "",
  access: "members",
  kind: "link",
  url: "",
  featured: false,
  status: "draft",
  scheduledAt: null,
  fileName: null,
  fileSize: null,
  fileUploadedAt: null,
  scanStatus: null,
  videoDurationSeconds: null,
  videoThumbnailUrl: null,
  thumbnailUrl: null,
  thumbnailAuto: false,
};

const SCAN_LABEL: Record<string, string> = {
  clean: "Virus scan passed",
  unscanned: "Not virus-scanned (no scanner configured)",
  pending: "Virus scan pending",
};

const THUMB_TYPES = ["image/png", "image/jpeg", "image/webp"];
const MAX_THUMB_BYTES = 2 * 1024 * 1024;

// <input type="datetime-local"> wants local "YYYY-MM-DDTHH:mm".
function toLocalInputValue(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function ResourceForm({
  id,
  initial = EMPTY,
  categories: initialCategories,
  types: initialTypes,
  underReview = false,
  backHref = "/admin/resources",
}: {
  id: string | null;
  initial?: ResourceFormInitial;
  categories: ResourceCategory[];
  types: string[];
  // A member submission not yet approved: its status is set by
  // Approve / Reject / Request changes, not here.
  underReview?: boolean;
  backHref?: string;
}) {
  const router = useRouter();
  const showToast = useToast();
  const [values, setValues] = useState(initial);
  const [categories, setCategories] = useState(initialCategories);
  const [types, setTypes] = useState(initialTypes);
  const [slugTouched, setSlugTouched] = useState(!!id);
  const [file, setFile] = useState<File | null>(null);
  const [thumb, setThumb] = useState<File | null>(null);
  const [thumbRemoved, setThumbRemoved] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);

  const set = <K extends keyof ResourceFormInitial>(key: K, value: ResourceFormInitial[K]) =>
    setValues((v) => ({ ...v, [key]: value }));

  const hasStoredFile = initial.kind === "file" && !!initial.fileName;
  const currentThumb = thumbRemoved ? null : initial.thumbnailUrl;

  function setTitle(title: string) {
    setValues((v) => ({ ...v, title, slug: slugTouched ? v.slug : slugBase(title, "") }));
  }

  function pickFile(f: File | null) {
    if (f && !fileExtension(f.name)) {
      showToast("Only PDF, DOCX, XLSX, PPTX, CSV and ZIP files are allowed.");
      return;
    }
    if (f && f.size > MAX_RESOURCE_FILE_BYTES) {
      showToast("Files can be at most 25 MB.");
      return;
    }
    setFile(f);
  }

  function pickThumb(f: File | null) {
    if (f && !THUMB_TYPES.includes(f.type)) {
      showToast("Thumbnails can be PNG, JPG or WebP.");
      return;
    }
    if (f && f.size > MAX_THUMB_BYTES) {
      showToast("Thumbnails can be at most 2 MB.");
      return;
    }
    setThumb(f);
  }

  async function addType() {
    const name = prompt("New resource type (e.g. Webinar):")?.trim();
    if (!name) return;
    const res = await addResourceTypeAction(name);
    if (res.error || !res.name) return showToast(res.error ?? "Couldn't add that type.");
    setTypes((t) => (t.includes(res.name!) ? t : [...t, res.name!]));
    set("type", res.name);
  }

  async function addCategory() {
    const name = prompt("New category name:")?.trim();
    if (!name) return;
    const res = await addResourceCategoryAction(name);
    if (res.error || !res.id || !res.name) return showToast(res.error ?? "Couldn't add that category.");
    setCategories((c) => (c.some((x) => x.id === res.id) ? c : [...c, { id: res.id!, name: res.name! }]));
    set("categoryId", res.id);
  }

  async function uploadFile(resourceId: string, f: File): Promise<{ error?: string; warning?: string }> {
    const ext = fileExtension(f.name)!;
    const safe = f.name.replace(/[^A-Za-z0-9._-]+/g, "-");
    const path = `${resourceId}/${Date.now()}-${safe}`;
    setBusy("Uploading…");
    const { error } = await createClient()
      .storage.from("resource-files")
      .upload(path, f, { contentType: RESOURCE_FILE_TYPES[ext] });
    if (error) return { error: `Upload failed: ${error.message}` };
    setBusy("Scanning…");
    return attachResourceFileAction(resourceId, path, f.name);
  }

  async function uploadThumb(resourceId: string, blob: Blob, name: string, auto: boolean): Promise<string | undefined> {
    const path = `${resourceId}/${Date.now()}-${name.replace(/[^A-Za-z0-9._-]+/g, "-")}`;
    const { error } = await createClient()
      .storage.from("resource-thumbnails")
      .upload(path, blob, { contentType: blob.type || "image/png" });
    if (error) return `Thumbnail upload failed: ${error.message}`;
    const res = await setResourceThumbnailAction(resourceId, path, auto);
    return res.error;
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (values.kind === "file" && !file && !hasStoredFile) {
      showToast("Choose a file to upload.");
      return;
    }
    if (!values.categoryId) {
      showToast("Pick a category.");
      return;
    }
    setBusy("Saving…");
    const saved = await saveResourceAction(id, {
      title: values.title,
      slug: values.slug,
      type: values.type,
      categoryId: values.categoryId,
      description: values.description,
      body: values.body,
      tags: values.tags,
      source: values.source,
      access: values.access,
      kind: values.kind,
      url: values.url,
      featured: values.featured,
      status: values.status,
      scheduledAt: values.status === "scheduled" && values.scheduledAt ? new Date(values.scheduledAt).toISOString() : null,
    });
    if (saved.error || !saved.id) {
      setBusy(null);
      showToast(saved.error ?? "Couldn't save.");
      return;
    }

    let warning = saved.warning;
    if (values.kind === "file" && file) {
      const uploaded = await uploadFile(saved.id, file);
      if (uploaded.error) {
        setBusy(null);
        showToast(uploaded.error);
        // The resource row exists now; keep the admin on it to retry the
        // file (it stays hidden from members until a file is attached).
        if (!id) router.push(`/admin/resources/${saved.id}/edit`);
        return;
      }
      warning = uploaded.warning ?? warning;

      // No custom image: use the new PDF's first page.
      const keepCustom = !!currentThumb && !initial.thumbnailAuto;
      if (!thumb && !keepCustom && fileExtension(file.name) === "pdf") {
        setBusy("Making thumbnail…");
        const png = await pdfFirstPageThumbnail(file);
        if (png) {
          const thumbError = await uploadThumb(saved.id, png, "first-page.png", true);
          if (thumbError) warning = thumbError;
        }
      }
    }

    if (thumb) {
      setBusy("Uploading thumbnail…");
      const thumbError = await uploadThumb(saved.id, thumb, thumb.name, false);
      if (thumbError) warning = thumbError;
    } else if (thumbRemoved && initial.thumbnailUrl) {
      await setResourceThumbnailAction(saved.id, null, false);
    }

    setBusy(null);
    showToast(warning ?? (id ? "Saved" : "Created"));
    router.push(backHref);
    router.refresh();
  }

  async function openStoredFile() {
    if (!id) return;
    const res = await adminResourceFileUrlAction(id);
    if (res.url) window.open(res.url, "_blank", "noopener,noreferrer");
    else showToast(res.error ?? "Couldn't open the file.");
  }

  const previewThumb = currentThumb ?? (values.kind === "video" && initial.kind === "video" ? initial.videoThumbnailUrl : null);

  return (
    <>
      <Link href={backHref} className="link-btn" style={{ display: "inline-block", marginBottom: 14 }}>
        ← Back
      </Link>
      <form onSubmit={handleSubmit}>
        <div className="card panel ra-form">
          <label className="label ra-span">
            <span className="ra-label-row">
              Title *<span className="meta">{values.title.length}/{RESOURCE_TITLE_MAX}</span>
            </span>
            <input className="field" value={values.title} required maxLength={RESOURCE_TITLE_MAX} onChange={(e) => setTitle(e.target.value)} />
          </label>

          <label className="label ra-span">
            <span className="ra-label-row">
              Short description *<span className="meta">{values.description.length}/{RESOURCE_SUMMARY_MAX}</span>
            </span>
            <textarea
              className="textarea"
              rows={2}
              value={values.description}
              required
              maxLength={RESOURCE_SUMMARY_MAX}
              onChange={(e) => set("description", e.target.value)}
            />
            <small className="meta">Shown on the resource card.</small>
          </label>

          <div className="label ra-span">
            Full description
            <RichTextEditor
              value={values.body}
              onChange={(v) => set("body", v)}
              placeholder="What's inside, who it's for, how to use it…"
              minHeight={160}
              defaultToolbarOpen
            />
            <small className="meta">Shown on the resource&apos;s own page.</small>
          </div>

          <label className="label">
            <span className="ra-label-row">
              Type *
              <button type="button" className="link-btn" onClick={addType}>+ Add type</button>
            </span>
            <select className="select" value={values.type} required onChange={(e) => set("type", e.target.value)}>
              <option value="">Select…</option>
              {types.map((t) => (
                <option key={t}>{t}</option>
              ))}
            </select>
          </label>
          <label className="label">
            <span className="ra-label-row">
              Category *
              <button type="button" className="link-btn" onClick={addCategory}>+ Add category</button>
            </span>
            <select className="select" value={values.categoryId} required onChange={(e) => set("categoryId", e.target.value)}>
              <option value="">Select…</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </label>

          <label className="label">
            Tags
            <input className="field" value={values.tags} placeholder="8(a), WOSB, NAICS" onChange={(e) => set("tags", e.target.value)} />
            <small className="meta">Separate with commas.</small>
          </label>
          <label className="label">
            Source / author
            <input
              className="field"
              value={values.source}
              maxLength={RESOURCE_SOURCE_MAX}
              placeholder="SBA, GovConUnited, or the member who submitted it"
              onChange={(e) => set("source", e.target.value)}
            />
          </label>

          <fieldset className="label ra-span ra-fieldset">
            <span>Delivery kind *</span>
            <div className="ra-radios">
              {RESOURCE_KINDS.map((k) => (
                <label key={k.value} className="admin-checkbox-label">
                  <input type="radio" name="kind" checked={values.kind === k.value} onChange={() => set("kind", k.value)} />
                  <span>{k.label}</span>
                </label>
              ))}
            </div>
          </fieldset>

          {values.kind === "file" && (
            <div className="label ra-span">
              File *
              {hasStoredFile && (
                <div className="meta" style={{ margin: "4px 0 8px" }}>
                  Current: <strong>{initial.fileName}</strong>
                  {initial.fileSize ? ` · ${formatFileSize(initial.fileSize)}` : ""}
                  {initial.fileUploadedAt ? ` · uploaded ${new Date(initial.fileUploadedAt).toLocaleDateString()}` : ""}
                  {initial.scanStatus ? ` · ${SCAN_LABEL[initial.scanStatus] ?? initial.scanStatus}` : ""}{" "}
                  <button type="button" className="link-btn" onClick={openStoredFile}>
                    Open
                  </button>
                </div>
              )}
              <input type="file" accept={RESOURCE_FILE_ACCEPT} onChange={(e) => pickFile(e.target.files?.[0] ?? null)} />
              <small className="meta">
                PDF, DOCX, XLSX, PPTX, CSV or ZIP · up to 25 MB · virus-scanned on upload
                {hasStoredFile ? " · choosing a file replaces the current one (same link; the old file is kept in the history)" : ""}
              </small>
            </div>
          )}

          {values.kind !== "file" && (
            <label className="label ra-span">
              {values.kind === "video" ? "YouTube or Vimeo URL *" : "Link URL *"}
              <input
                className="field"
                type="url"
                required
                value={values.url}
                placeholder={values.kind === "video" ? "https://www.youtube.com/watch?v=…" : "https://www.sba.gov/…"}
                onChange={(e) => set("url", e.target.value)}
              />
              <small className="meta">
                {values.kind === "video"
                  ? "Plays on GovConUnited. The thumbnail and length are pulled from YouTube/Vimeo when you save."
                  : "Members see “External link” with this site's domain, and it opens in a new tab."}
              </small>
              {values.kind === "video" && initial.kind === "video" && initial.videoDurationSeconds ? (
                <span className="meta">Length: {formatDuration(initial.videoDurationSeconds)}</span>
              ) : null}
            </label>
          )}

          <div className="label ra-span admin-image-field">
            Thumbnail
            {previewThumb && !thumb && (
              <span className="ra-thumb-row">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={previewThumb} alt="" width={128} height={72} className="ra-thumb" />
                <span className="meta">
                  {currentThumb
                    ? initial.thumbnailAuto
                      ? "Generated from the PDF's first page"
                      : "Custom image"
                    : "From the video"}
                </span>
                {currentThumb && (
                  <button type="button" className="link-btn" onClick={() => setThumbRemoved(true)}>
                    Remove
                  </button>
                )}
              </span>
            )}
            <input type="file" accept={THUMB_TYPES.join(",")} onChange={(e) => pickThumb(e.target.files?.[0] ?? null)} />
            <small className="meta">
              Optional · PNG, JPG or WebP up to 2 MB. Left empty, it&apos;s generated from the PDF&apos;s first page, or the video&apos;s own
              thumbnail is used.
            </small>
          </div>

          <fieldset className="label ra-span ra-fieldset">
            <span>Access level *</span>
            <div className="ra-radios">
              {RESOURCE_ACCESS_LEVELS.map((a) => (
                <label key={a.value} className="admin-checkbox-label" title={a.hint}>
                  <input type="radio" name="access" checked={values.access === a.value} onChange={() => set("access", a.value)} />
                  <span>
                    {a.label} <span className="meta">({a.hint})</span>
                  </span>
                </label>
              ))}
            </div>
          </fieldset>

          {underReview ? (
            <p className="meta ra-span" style={{ margin: 0 }}>
              This is a member submission under review. Save your edits, then Approve (publishes it), Reject or Request changes above.
            </p>
          ) : (
            <>
              <label className="label">
                Status *
                <select className="select" value={values.status} onChange={(e) => set("status", e.target.value as ResourceStatus)}>
                  {RESOURCE_STATUSES.map((s) => (
                    <option key={s.value} value={s.value}>{s.label}</option>
                  ))}
                </select>
              </label>
              {values.status === "scheduled" ? (
                <label className="label">
                  Publish at *
                  <input
                    className="field"
                    type="datetime-local"
                    required
                    value={toLocalInputValue(values.scheduledAt)}
                    onChange={(e) => set("scheduledAt", e.target.value ? new Date(e.target.value).toISOString() : null)}
                  />
                </label>
              ) : (
                <span />
              )}
            </>
          )}

          <label className="admin-checkbox-label ra-span">
            <input type="checkbox" checked={values.featured} onChange={(e) => set("featured", e.target.checked)} />
            <span>
              Featured <span className="meta">(pinned to the top of All Resources)</span>
            </span>
          </label>

          <label className="label ra-span">
            Slug
            <span className="ra-slug">
              <span className="meta">/resources/</span>
              <input
                className="field"
                value={values.slug}
                placeholder="made-from-the-title"
                maxLength={80}
                onChange={(e) => {
                  setSlugTouched(true);
                  set("slug", e.target.value.toLowerCase().replace(/[^a-z0-9-]+/g, "-"));
                }}
              />
            </span>
            <small className="meta">Made from the title; edit it if you like. Changing it breaks links people already shared.</small>
          </label>

          <div className="ra-span" style={{ display: "flex", gap: 10 }}>
            <button className="btn btn-primary" type="submit" disabled={!!busy}>
              {busy ?? (id ? "Save changes" : "Create")}
            </button>
            <button className="btn btn-outline" type="button" onClick={() => router.push(backHref)}>
              Cancel
            </button>
          </div>
        </div>
      </form>
    </>
  );
}
