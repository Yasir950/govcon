"use client";

import { useEffect, useState } from "react";
import QRCode from "qrcode";
import { useToast } from "@/components/toast-provider";
import { getEventCheckinCodeAction } from "@/app/(app)/rewards/actions";

// Host-only: the in-person check-in QR code. Attendees scan it (or open the
// link / type the code at /events/checkin) during the event to be marked
// attended, which pays the Attend-an-event XP.
export function EventCheckinHostCard({ eventId }: { eventId: string }) {
  const showToast = useToast();
  const [code, setCode] = useState<string | null>(null);
  const [qr, setQr] = useState<string | null>(null);
  const [url, setUrl] = useState("");

  useEffect(() => {
    let cancelled = false;
    getEventCheckinCodeAction(eventId).then(async (c) => {
      if (cancelled || !c) return;
      const link = `${window.location.origin}/events/checkin/${c}`;
      setCode(c);
      setUrl(link);
      setQr(await QRCode.toDataURL(link, { width: 240, margin: 1 }));
    });
    return () => {
      cancelled = true;
    };
  }, [eventId]);

  if (!code) return null;
  return (
    <section className="card panel">
      <h2 className="section-title">In-person check-in</h2>
      <p className="meta">
        Show this QR code at the venue. Check-in opens 2 hours before the start and closes 2 hours after the end. Virtual attendees are counted
        automatically after 10 minutes on the event page while it&apos;s live.
      </p>
      {qr && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={qr} alt={`Check-in QR code (${code})`} width={200} height={200} style={{ display: "block", margin: "10px auto" }} />
      )}
      <p style={{ textAlign: "center", fontWeight: 700, letterSpacing: "0.12em", margin: "4px 0" }}>{code.toUpperCase()}</p>
      <div className="points-invite">
        <input readOnly value={url} aria-label="Check-in link" onFocus={(e) => e.currentTarget.select()} />
        <button className="btn btn-secondary" onClick={() => navigator.clipboard?.writeText(url).then(() => showToast("Check-in link copied."))}>
          Copy
        </button>
      </div>
    </section>
  );
}
