import type { FeatureIcon } from "@/lib/landing-data";

// Shared by the landing page's feature-strip and the /resources page (which
// reuses the same featureHighlights content) — plain SVG, no client-only
// behavior, so it works in either a server or client component.
const iconStroke = {
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.8,
  strokeLinecap: "round",
  strokeLinejoin: "round",
  "aria-hidden": true,
} as const;

export function FeatureIconGlyph({ icon }: { icon: FeatureIcon }) {
  switch (icon) {
    case "document":
      return (
        <svg {...iconStroke} width={23} height={23}>
          <path d="M6 3h9l4 4v14H6z" />
          <path d="M15 3v5h5M9 12h7M9 16h7" />
        </svg>
      );
    case "network":
      return (
        <svg {...iconStroke} width={23} height={23}>
          <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
          <circle cx="9" cy="7" r="4" />
          <path d="M19 8v6M16 11h6" />
        </svg>
      );
    case "book":
      return (
        <svg {...iconStroke} width={23} height={23}>
          <path d="M4 5.5A2.5 2.5 0 0 1 6.5 3H11v17H6.5A2.5 2.5 0 0 0 4 22z" />
          <path d="M20 5.5A2.5 2.5 0 0 0 17.5 3H13v17h4.5A2.5 2.5 0 0 1 20 22z" />
        </svg>
      );
    case "calendar":
      return (
        <svg {...iconStroke} width={23} height={23}>
          <rect x="3" y="5" width="18" height="16" rx="2" />
          <path d="M16 3v4M8 3v4M3 10h18M8 14h3v3H8z" />
        </svg>
      );
    case "chat":
      return (
        <svg {...iconStroke} width={23} height={23}>
          <path d="M21 15a4 4 0 0 1-4 4H8l-5 3v-7a7 7 0 0 1-1-3.5A7.5 7.5 0 0 1 9.5 4h4A7.5 7.5 0 0 1 21 11.5z" />
        </svg>
      );
  }
}
