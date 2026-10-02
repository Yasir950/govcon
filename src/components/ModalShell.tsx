"use client";

// Shared popup chrome (dark overlay + centered white card + × close),
// matching the inline-style pattern already used by RepostModal /
// ProfileCompletenessModal / the sign-in prompt popup. Content rendered
// inside typically still carries its own `.card.panel` styling from being
// reused from a standalone page — see the `.modal-form-embed` override in
// landing.css that strips that double border/shadow/padding when embedded
// here instead of on its own page.
export function ModalShell({
  title,
  onClose,
  children,
  maxWidth = 640,
}: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
  maxWidth?: number;
}) {
  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 200,
        background: "rgba(4,15,35,.55)",
        display: "flex",
        alignItems: "flex-start",
        justifyContent: "center",
        padding: "40px 16px",
        overflowY: "auto",
      }}
      onClick={onClose}
    >
      <div
        className="modal-form-embed"
        style={{
          background: "#fff",
          borderRadius: 12,
          width: `min(${maxWidth}px, 100%)`,
          maxHeight: "calc(100vh - 80px)",
          overflowY: "auto",
          boxShadow: "0 24px 60px rgba(4,15,35,.35)",
          padding: 24,
          position: "relative",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <button
          type="button"
          aria-label="Close"
          onClick={onClose}
          style={{
            position: "absolute",
            top: 14,
            right: 16,
            border: 0,
            background: "none",
            fontSize: "1.3rem",
            cursor: "pointer",
            color: "var(--o-muted, #667386)",
            lineHeight: 1,
          }}
        >
          ×
        </button>
        <h2 style={{ margin: "0 0 16px", fontSize: "1.1rem", paddingRight: 24, color: "var(--o-ink, #17243a)" }}>
          {title}
        </h2>
        {children}
      </div>
    </div>
  );
}
