"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { upsertContentAction, type ManagedTable } from "@/app/admin/actions";
import { LocationAutocomplete } from "@/components/LocationAutocomplete";
import { useToast } from "@/components/toast-provider";

export interface AdminFieldConfig {
  key: string;
  label: string;
  type: "text" | "textarea" | "number" | "date" | "dateonly" | "select" | "tags" | "checkbox" | "location" | "image";
  required?: boolean;
  options?: { value: string; label: string }[];
  placeholder?: string;
  help?: string;
  // type: "image" only. Uploads immediately on file pick rather than on
  // form submit (matches uploadCoverImageAction's own immediate-upload
  // pattern) — pass a server action already bound to the entity id, so
  // this component stays generic instead of knowing which table/bucket
  // it's uploading to. Omit (or pass undefined) when there's no id yet
  // (the "new" page) — the field renders a disabled note instead.
  uploadAction?: (formData: FormData) => Promise<{ error?: string; url?: string }>;
}

// undefined means "omit this key" — for an optional text field left blank,
// that leaves an existing DB default (or an unedited value, on update)
// alone instead of overwriting it with an empty string.
function toPayloadValue(field: AdminFieldConfig, raw: string, checked: boolean): unknown {
  switch (field.type) {
    case "number":
      return raw === "" ? null : Number(raw);
    case "tags":
      return raw
        .split(",")
        .map((t) => t.trim())
        .filter(Boolean);
    case "checkbox":
      return checked;
    case "date":
      return raw ? new Date(raw).toISOString() : null;
    case "dateonly":
      return raw || null;
    case "text":
    case "textarea":
    case "select":
    case "location":
      return field.required ? raw : raw.trim() === "" ? undefined : raw;
    case "image":
      // Persisted immediately by its own uploadAction, not through this
      // form's submit payload.
      return undefined;
    default:
      return raw;
  }
}

// One shared create/edit form for every managed content type — each admin
// page supplies its own field list (AdminFieldConfig[]) since every table
// has different real columns; this only owns the generic submit/validate/
// redirect plumbing so that isn't duplicated 8 times.
export function AdminEntityForm({
  table,
  id,
  fields,
  initialValues,
  redirectTo,
  fixedFields,
  sidebarKeys = [],
}: {
  table: ManagedTable;
  id: string | null;
  fields: AdminFieldConfig[];
  initialValues: Record<string, string>;
  redirectTo: string;
  // Values submitted unconditionally alongside the form's own fields, but
  // never rendered as an input — e.g. posts.author_profile_id, which must
  // be the signed-in admin's real id, not something typed into a form.
  fixedFields?: Record<string, unknown>;
  // Field keys (typically media/status — logo, cover image, "verified")
  // rendered in a second card next to the main one instead of stacked
  // inline, so a long field list doesn't collapse into one narrow column
  // with the rest of the page left empty. Still one form, one submit —
  // purely a visual split.
  sidebarKeys?: string[];
}) {
  const router = useRouter();
  const showToast = useToast();
  const formRef = useRef<HTMLFormElement>(null);
  const [values, setValues] = useState<Record<string, string>>(initialValues);
  const [checked, setChecked] = useState<Record<string, boolean>>(
    Object.fromEntries(fields.filter((f) => f.type === "checkbox").map((f) => [f.key, initialValues[f.key] === "true"])),
  );
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState<Record<string, boolean>>({});
  const [errorField, setErrorField] = useState<string | null>(null);

  // The old behavior just toasted "Title is required." with nothing
  // pointing at where — on a long form (several are two full cards) that
  // left the person scanning every field by eye. Scrolls straight to the
  // missing one and highlights it instead.
  function focusField(key: string) {
    setErrorField(key);
    const el = formRef.current?.querySelector<HTMLElement>(`[data-field-key="${key}"]`);
    el?.scrollIntoView({ behavior: "smooth", block: "center" });
    el?.querySelector<HTMLElement>("input, textarea, select")?.focus();
  }

  function setFieldValue(key: string, value: string) {
    setValues((v) => ({ ...v, [key]: value }));
    setErrorField((current) => (current === key ? null : current));
  }

  async function handleImageUpload(field: AdminFieldConfig, file: File) {
    if (!field.uploadAction) return;
    setUploading((u) => ({ ...u, [field.key]: true }));
    const formData = new FormData();
    formData.set("file", file);
    const result = await field.uploadAction(formData);
    setUploading((u) => ({ ...u, [field.key]: false }));
    if (result.error) {
      showToast(result.error);
      return;
    }
    if (result.url) {
      setValues((v) => ({ ...v, [field.key]: result.url! }));
      showToast("Uploaded");
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    for (const field of fields) {
      if (field.required && field.type !== "checkbox" && !values[field.key]?.trim()) {
        showToast(`${field.label} is required.`);
        focusField(field.key);
        return;
      }
    }
    setErrorField(null);

    const payload: Record<string, unknown> = { ...fixedFields };
    for (const field of fields) {
      const value = toPayloadValue(field, values[field.key] ?? "", checked[field.key] ?? false);
      if (value !== undefined) payload[field.key] = value;
    }

    setSaving(true);
    const result = await upsertContentAction(table, id, payload);
    setSaving(false);
    if (result.error) {
      showToast(result.error);
      return;
    }
    showToast(id ? "Saved" : "Created");
    router.push(redirectTo);
    router.refresh();
  }

  // Short, single-line fields render two per row so a long field list
  // doesn't turn into a tall column of mostly-empty horizontal space —
  // textarea/tags/image/location fields still take the full row width.
  const FULL_WIDTH_TYPES = new Set<AdminFieldConfig["type"]>(["textarea", "tags", "image", "location"]);

  function renderField(field: AdminFieldConfig) {
    const invalid = errorField === field.key;

    if (field.type === "checkbox") {
      return (
        <label className="label admin-checkbox-label" key={field.key} data-field-key={field.key}>
          <input
            type="checkbox"
            checked={checked[field.key] ?? false}
            onChange={(e) => setChecked((c) => ({ ...c, [field.key]: e.target.checked }))}
          />
          <span>{field.label}</span>
          {field.help && <small className="meta">{field.help}</small>}
        </label>
      );
    }

    return (
      <label
        className="label"
        key={field.key}
        data-field-key={field.key}
        style={FULL_WIDTH_TYPES.has(field.type) ? { gridColumn: "1 / -1" } : undefined}
      >
        {field.label}
        {field.required ? " *" : ""}
        {invalid && <span className="field-error-text"> — required</span>}
        {field.type === "image" ? (
          field.uploadAction ? (
            <div className="admin-image-field">
              <div className={`admin-image-preview${values[field.key] ? "" : " is-empty"}`}>
                {values[field.key] ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={values[field.key]} alt={field.label} />
                ) : (
                  <span className="meta">No image yet</span>
                )}
              </div>
              <input
                type="file"
                accept="image/*"
                disabled={uploading[field.key]}
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) void handleImageUpload(field, file);
                  e.target.value = "";
                }}
              />
              {uploading[field.key] && <small className="meta">Uploading…</small>}
            </div>
          ) : (
            <small className="meta">Save this record first, then come back to upload {field.label.toLowerCase()}.</small>
          )
        ) : field.type === "location" ? (
          <LocationAutocomplete
            value={values[field.key] ?? ""}
            onChange={(v) => setFieldValue(field.key, v)}
            placeholder={field.placeholder}
          />
        ) : field.type === "textarea" ? (
          <textarea
            className={`textarea${invalid ? " field-invalid" : ""}`}
            value={values[field.key] ?? ""}
            placeholder={field.placeholder}
            onChange={(e) => setFieldValue(field.key, e.target.value)}
          />
        ) : field.type === "select" ? (
          <select
            className={`select${invalid ? " field-invalid" : ""}`}
            value={values[field.key] ?? ""}
            onChange={(e) => setFieldValue(field.key, e.target.value)}
          >
            <option value="">Select…</option>
            {field.options?.map((opt) => (
              <option value={opt.value} key={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        ) : (
          <input
            className={`field${invalid ? " field-invalid" : ""}`}
            type={
              field.type === "date"
                ? "datetime-local"
                : field.type === "dateonly"
                  ? "date"
                  : field.type === "number"
                    ? "number"
                    : "text"
            }
            value={values[field.key] ?? ""}
            placeholder={field.placeholder}
            onChange={(e) => setFieldValue(field.key, e.target.value)}
          />
        )}
        {field.help && <small className="meta">{field.help}</small>}
      </label>
    );
  }

  const sidebarSet = new Set(sidebarKeys);
  const mainFields = fields.filter((f) => !sidebarSet.has(f.key));
  const sideFields = fields.filter((f) => sidebarSet.has(f.key));

  return (
    <>
      <Link href={redirectTo} className="link-btn" style={{ display: "inline-block", marginBottom: 14 }}>
        ← Back
      </Link>
      <form ref={formRef} onSubmit={handleSubmit} className={sideFields.length > 0 ? "admin-form-grid" : undefined}>
      <div className="card panel admin-form-main" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14, alignItems: "start" }}>
        {mainFields.map(renderField)}
        <div style={{ display: "flex", gap: 10, gridColumn: "1 / -1" }}>
          <button className="btn btn-primary" type="submit" disabled={saving}>
            {saving ? "Saving…" : id ? "Save changes" : "Create"}
          </button>
          <button className="btn btn-outline" type="button" onClick={() => router.push(redirectTo)}>
            Cancel
          </button>
        </div>
      </div>
      {sideFields.length > 0 && (
        <div className="card panel admin-form-aside" style={{ display: "grid", gap: 14, alignContent: "start" }}>
          {sideFields.map(renderField)}
        </div>
      )}
      </form>
    </>
  );
}
