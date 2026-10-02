import Link from "next/link";
import type { MessageItem } from "@/lib/landing-data";

// A message bubble's contents. Recommendation requests (see
// requestRecommendationAction) render as a card with an action; the sender
// is always the member asking to be recommended.
export function MessageBody({ m, showImage = true }: { m: MessageItem; showImage?: boolean }) {
  const image =
    showImage && m.imageUrl ? (
      // eslint-disable-next-line @next/next/no-img-element
      <img src={m.imageUrl} alt="" style={{ maxWidth: "100%", borderRadius: 8, display: "block", marginBottom: m.body ? 6 : 0 }} />
    ) : null;

  if (!m.recommendationRequestId) {
    return (
      <>
        {image}
        {m.body}
      </>
    );
  }

  return (
    <div style={{ display: "grid", gap: 8, minWidth: 200 }}>
      <strong style={{ fontSize: 13 }}>📝 Recommendation request</strong>
      <span style={{ whiteSpace: "pre-wrap" }}>{m.body}</span>
      <Link
        href={m.mine ? `/network/${m.senderId}#recommendations` : `/network/${m.senderId}?recommend=1#recommendations`}
        className="btn btn-sm"
        style={{ background: "#fff", color: "var(--o-blue)", border: "1px solid currentColor", justifySelf: "start" }}
      >
        {m.mine ? "View request" : "Write recommendation"}
      </Link>
    </div>
  );
}
