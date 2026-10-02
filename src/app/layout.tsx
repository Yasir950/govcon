import type { Metadata } from "next";
import { ScrollToTop } from "@/components/ScrollToTop";
import { SignInPromptProvider } from "@/components/sign-in-prompt-provider";
import { ToastProvider } from "@/components/toast-provider";
import "./globals.css";
// The sign-in popup (SignInPromptProvider, mounted below) embeds the real
// LoginForm — auth.css is normally imported per-page (see the many
// `import "../(auth)/auth.css"` across src/app/**), but the popup can be
// triggered from any page, including ones that never import it on their
// own, so it needs to be available globally.
import "./(auth)/auth.css";
// Points & Rewards UI shows up in every signed-in shell (streak counter,
// rank labels), including /companies which has its own layouts.
import "./points.css";
import "./habits.css";
import "./social.css";
import "./learning.css";

const siteUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
const description =
  "GovConUnited connects government contractors, subcontractors, consultants, suppliers, and GovCon professionals with opportunities, trusted relationships, resources, and events.";

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  // Plain string, not a title.template — every page already appends its
  // own "· GovConUnited" suffix (see the many generateMetadata functions
  // across src/app/**), so a template here would double it up site-wide.
  title: "GovConUnited",
  description,
  alternates: { canonical: "/" },
  openGraph: {
    title: "GovConUnited",
    description,
    url: siteUrl,
    siteName: "GovConUnited",
    type: "website",
  },
  twitter: {
    card: "summary",
    title: "GovConUnited",
    description,
  },
};

const organizationJsonLd = {
  "@context": "https://schema.org",
  "@type": "Organization",
  name: "GovConUnited",
  url: siteUrl,
  logo: `${siteUrl}/images/logo.svg`,
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en">
      <body>
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(organizationJsonLd) }}
        />
        <ScrollToTop />
        <ToastProvider>
          <SignInPromptProvider>{children}</SignInPromptProvider>
        </ToastProvider>
      </body>
    </html>
  );
}
