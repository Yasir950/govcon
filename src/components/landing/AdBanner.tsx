"use client";

import Script from "next/script";
import { useEffect, useRef } from "react";

const AD_CLIENT = "ca-pub-7474005029572115";
const AD_SLOT = "2520059385";

// Only ever rendered for free/signed-out visitors (see the showAd checks
// in SiteFooter and DashboardRightRail) — Pro members' pages never even
// request adsbygoogle.js, so there's no third-party ad overhead on a paid
// plan.
//
// `variant="rail"` is the compact card at the top of the dashboard's right
// rail; the default is the full-width strip above the footer. Both can be
// on the same page, so each instance pushes its own slot from an effect —
// a <Script id="…"> push would be deduped by next/script and leave the
// second <ins> unfilled. The library <Script> itself is meant to load once.
export function AdBanner({ variant = "footer" }: { variant?: "footer" | "rail" }) {
  const pushed = useRef(false);

  useEffect(() => {
    if (pushed.current) return;
    pushed.current = true;
    try {
      const w = window as unknown as { adsbygoogle?: unknown[] };
      (w.adsbygoogle = w.adsbygoogle || []).push({});
    } catch {
      // AdSense throws if the slot was already filled — nothing to do.
    }
  }, []);

  const isRail = variant === "rail";

  return (
    <div
      className={isRail ? "home-ad-card" : undefined}
      style={isRail ? undefined : { display: "flex", justifyContent: "center", padding: "20px 16px", background: "#fff" }}
    >
      {isRail ? (
        // Fixed-size slot: AdSense sizes a responsive unit to its CSS box
        // when data-ad-format/data-full-width-responsive are omitted. The
        // 300×250 / 280×250 dimensions live in landing.css (.home-ad-slot).
        <ins className="adsbygoogle home-ad-slot" data-ad-client={AD_CLIENT} data-ad-slot={AD_SLOT} />
      ) : (
        <ins
          className="adsbygoogle"
          style={{ display: "block", width: "100%", maxWidth: 970 }}
          data-ad-client={AD_CLIENT}
          data-ad-slot={AD_SLOT}
          data-ad-format="auto"
          data-full-width-responsive="true"
        />
      )}
      <Script
        id="adsbygoogle-lib"
        strategy="afterInteractive"
        src={`https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${AD_CLIENT}`}
        crossOrigin="anonymous"
      />
    </div>
  );
}
