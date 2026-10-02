"use client";

import Link from "next/link";
import Script from "next/script";
import { useEffect, useRef } from "react";
import { AdBanner } from "@/components/landing/AdBanner";
import { footerColumns } from "@/lib/landing-data";
import {
  AppleIcon,
  FacebookIcon,
  GooglePlayIcon,
  InstagramIcon,
  LinkedinIcon,
  XIcon,
} from "@/components/landing/footer-icons";
import type { SiteSettings } from "@/lib/supabase/queries";
import type { Viewer } from "@/lib/supabase/viewer";

// Same fallback crewupapp's footer.tsx uses for its own social/app links
// (SOCIAL_URL = "https://crewupapp.co/") — until an admin sets a real,
// distinct account URL for a given icon (see getSiteSettings/
// /admin/settings), it points at GovConUnited's own site rather than a
// dead "#" link or a hidden icon.
const FALLBACK_URL = process.env.NEXT_PUBLIC_APP_URL || "https://govconunited.com";

// Shared footer, rendered on the landing page and every dedicated section
// page. `settings` is optional (admin-managed real social/app-store URLs,
// see getSiteSettings). `viewer` is optional too — every call site that
// can be reached by a signed-in user passes it so Pro members never see
// the ad banner; call sites that are only ever reached signed-out can
// omit it (undefined behaves the same as null here).
const EOMAIL_FORM_ID = "27ba13fe-bd8d-11f1-899e-335d05e88485";

export function SiteFooter({ settings, viewer }: { settings?: SiteSettings; viewer?: Viewer | null } = {}) {
  // AdSense never actually fills a slot on localhost (unapproved domain),
  // but the <ins> still reserves its full placeholder height once
  // adsbygoogle.js processes it — leaving a large blank gap above the
  // footer on every page in dev. Real Pro-gating (free/signed-out only)
  // stays the same in production; this just skips the empty reservation
  // outside of it.
  const showAd = (!viewer || viewer.planSelection !== "pro") && process.env.NODE_ENV === "production";
  const newsletterTargetRef = useRef<HTMLDivElement>(null);

  // EmailOctopus's embed script (loaded below) doesn't render inline where
  // its <script> tag sits — it appends its form as a plain, normal-flow
  // div (`.inline-container[data-form=…]`) to the very end of <body>,
  // which put it below the entire footer instead of "above the social
  // icons" per the design. Since it's a real, reparentable DOM node (not
  // a fixed/floating overlay), a MutationObserver can find it once the
  // script creates it and move it into place — the script itself, and
  // its reCAPTCHA/submit wiring, are untouched by the move.
  useEffect(() => {
    function tryMove(): boolean {
      const widget = document.querySelector(`.inline-container[data-form="${EOMAIL_FORM_ID}"]`);
      if (widget && newsletterTargetRef.current) {
        newsletterTargetRef.current.appendChild(widget);
        return true;
      }
      return false;
    }

    if (tryMove()) return;

    const observer = new MutationObserver(() => {
      if (tryMove()) observer.disconnect();
    });
    observer.observe(document.body, { childList: true });
    return () => observer.disconnect();
  }, []);

  return (
    <>
      {showAd && <AdBanner />}
      <footer>
      <div className="wrap">
        <div className="footgrid">
          <div className="footbrand">
            <Link className="brand" href="/" aria-label="GovConUnited home">
              <img
                className="brand-logo"
                src="/images/logo.svg"
                alt="GovConUnited"
              />
            </Link>
            <p>
              The professional network connecting government contractors with
              opportunities, partners, resources, and industry relationships.
            </p>
            {/* Populated by the MutationObserver above once EmailOctopus's
                script creates its form — kept empty otherwise so nothing
                shifts if the script is slow or blocked. */}
            <div ref={newsletterTargetRef} className="footer-newsletter" />
            <Script
              async
              src={`https://eomail5.com/form/${EOMAIL_FORM_ID}.js`}
              data-form={EOMAIL_FORM_ID}
              strategy="afterInteractive"
            />
            <div className="socials">
              {(
                [
                  { label: "Facebook", Icon: FacebookIcon, url: settings?.socialFacebookUrl },
                  { label: "X", Icon: XIcon, url: settings?.socialXUrl },
                  { label: "Instagram", Icon: InstagramIcon, url: settings?.socialInstagramUrl },
                  { label: "LinkedIn", Icon: LinkedinIcon, url: settings?.socialLinkedinUrl },
                ] as const
              ).map(({ label, Icon, url }) => (
                <a key={label} href={url || FALLBACK_URL} target="_blank" rel="noopener noreferrer" aria-label={label}>
                  <Icon width={16} height={16} />
                </a>
              ))}
            </div>
            <div className="app-title">Get the app</div>
            <div className="app-buttons">
              <a className="app-badge" href={settings?.appStoreUrl || FALLBACK_URL} target="_blank" rel="noopener noreferrer" aria-label="App Store">
                <AppleIcon width={20} height={20} />
                <span>
                  <small>Download on the</small>
                  <b>App Store</b>
                </span>
              </a>
              <a className="app-badge" href={settings?.googlePlayUrl || FALLBACK_URL} target="_blank" rel="noopener noreferrer" aria-label="Google Play">
                <GooglePlayIcon width={20} height={20} />
                <span>
                  <small>Get it on</small>
                  <b>Google Play</b>
                </span>
              </a>
            </div>
          </div>
          {footerColumns.map((col) => (
            <div className="footcol" key={col.title}>
              <h4>{col.title}</h4>
              {col.links.map((link) => {
                const label = typeof link === "string" ? link : link.label;
                const href = typeof link === "string" ? "#" : link.href;
                const viewAll = typeof link === "object" && "viewAll" in link && link.viewAll;
                return (
                  <a href={href} key={label} className={viewAll ? "footcol-viewall" : undefined}>
                    {label}
                  </a>
                );
              })}
            </div>
          ))}
        </div>
        <div className="footer-bottom">
          <span>
            © 2026 GovConUnited, LLC.{" "}
            <a
              href="https://robbcc.com/"
              target="_blank"
              rel="noopener noreferrer"
            >
              A Robb Industrial Co.
            </a>{" "}
            All rights reserved.
          </span>
          <div className="footer-legal-links">
            <Link href="/privacy">Privacy Policy</Link>
            <Link href="/terms">Terms of Use</Link>
          </div>
        </div>
      </div>
      </footer>
    </>
  );
}
