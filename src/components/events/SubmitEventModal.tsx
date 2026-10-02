"use client";

import { useState } from "react";
import { submitEventAction } from "@/app/(app)/events/actions";
import { createClient as createBrowserClient } from "@/lib/supabase/client";
import { LocationAutocomplete } from "@/components/LocationAutocomplete";
import { useToast } from "@/components/toast-provider";
import type { Viewer } from "@/lib/supabase/viewer";

const EVENT_TYPES = [
  { value: "webinar", label: "Webinar" },
  { value: "virtual_conference", label: "Virtual Conference" },
  { value: "networking", label: "Networking" },
  { value: "workshop", label: "Workshop" },
  { value: "training", label: "Training" },
  { value: "trade_show", label: "Trade Show" },
];

export function SubmitEventModal({ viewer, onClose, onSubmitted }: { viewer: Viewer; onClose: () => void; onSubmitted: (slug: string) => void }) {
  const showToast = useToast();
  const [title, setTitle] = useState("");
  const [format, setFormat] = useState("webinar");
  const [startsAt, setStartsAt] = useState("");
  const [location, setLocation] = useState("");
  const [description, setDescription] = useState("");
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function handleImagePicked(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setUploadError(null);
    if (!file.type.startsWith("image/")) return setUploadError("Choose an image file.");
    if (file.size > 10 * 1024 * 1024) return setUploadError("Image must be smaller than 10MB.");

    setUploading(true);
    try {
      const supabase = createBrowserClient();
      const extension = file.name.split(".").pop() || "jpg";
      const path = `${viewer.id}/${crypto.randomUUID()}.${extension}`;
      const { error } = await supabase.storage.from("event-media").upload(path, file, { contentType: file.type });
      if (error) {
        setUploadError("Upload failed. Please try again.");
        return;
      }
      const { data } = supabase.storage.from("event-media").getPublicUrl(path);
      setImageUrl(data.publicUrl);
    } finally {
      setUploading(false);
    }
  }

  async function handleSave() {
    if (!title.trim() || !startsAt) return;
    setSaving(true);
    const formData = new FormData();
    formData.set("title", title.trim());
    formData.set("format", format);
    formData.set("startsAt", startsAt);
    formData.set("location", location.trim());
    formData.set("description", description.trim());
    formData.set("imageUrl", imageUrl ?? "");
    const result = await submitEventAction(formData);
    setSaving(false);
    if (result.error || !result.slug) {
      showToast(result.error ?? "Couldn't submit that event. Please try again.");
      return;
    }
    showToast("Event submitted");
    onSubmitted(result.slug);
  }

  return (
    <div className="modal-backdrop open" onClick={onClose}>
      <div className="opp-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-top">
          <div>
            <h3>Submit an Event</h3>
            <p>Share a webinar, conference, or networking event with the GovConUnited community.</p>
          </div>
          <button className="modal-close" onClick={onClose} aria-label="Close">
            ×
          </button>
        </div>
        <div className="modal-body">
          <div className="form-grid">
            <label className="label">
              Event Name
              <input className="field" value={title} onChange={(e) => setTitle(e.target.value)} required />
            </label>
            <label className="label">
              Event Type
              <select className="field" value={format} onChange={(e) => setFormat(e.target.value)}>
                {EVENT_TYPES.map((t) => (
                  <option key={t.value} value={t.value}>
                    {t.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="label">
              Date &amp; Time (ET)
              <input className="field" type="datetime-local" value={startsAt} onChange={(e) => setStartsAt(e.target.value)} required />
            </label>
            <label className="label">
              Location
              <LocationAutocomplete
                value={location}
                onChange={setLocation}
                placeholder="Online, or a city and state"
              />
            </label>
          </div>
          <label className="label" style={{ marginTop: 13 }}>
            Description (optional)
            <textarea className="textarea" value={description} onChange={(e) => setDescription(e.target.value)} />
          </label>
          <label className="label" style={{ marginTop: 13 }}>
            Event Image (optional)
            {imageUrl && (
              <img
                src={imageUrl}
                alt=""
                style={{ width: "100%", maxHeight: 160, objectFit: "cover", borderRadius: 8, margin: "8px 0" }}
              />
            )}
            <input className="field" type="file" accept="image/*" onChange={handleImagePicked} disabled={uploading} style={{ height: "auto", padding: 8 }} />
            {uploading && <span className="meta">Uploading…</span>}
            {uploadError && <span className="meta" style={{ color: "var(--o-red)" }}>{uploadError}</span>}
          </label>
          <div className="modal-actions">
            <button className="btn btn-outline" onClick={onClose} disabled={saving}>
              Cancel
            </button>
            <button className="btn btn-primary" onClick={handleSave} disabled={saving || uploading || !title.trim() || !startsAt}>
              {saving ? "Saving…" : "Save"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
