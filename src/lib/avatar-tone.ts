const AVATAR_TONES = ["blue", "red", "green", "purple", "gold"] as const;

// Deterministic per-company accent color so the same company gets the same
// avatar tone everywhere it appears (opportunities list, opportunity detail,
// company breakdown sidebar) without needing a stable company id threaded
// through every call site.
export function toneFor(name: string) {
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = (hash * 31 + name.charCodeAt(i)) >>> 0;
  return AVATAR_TONES[hash % AVATAR_TONES.length];
}
