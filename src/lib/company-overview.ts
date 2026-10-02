import type { Company } from "./landing-data";

const CARD_OVERVIEW_MAX = 60;

// Short one-line overview for company cards (directory, landing, partners).
// Prefers the company's own overview, falling back to tagline/summary, and
// clips to 60 characters on a word boundary where possible.
export function companyCardOverview(c: Pick<Company, "overview" | "tagline" | "summary">): string {
  const text = (c.overview || c.tagline || c.summary || "").replace(/\s+/g, " ").trim();
  if (text.length <= CARD_OVERVIEW_MAX) return text;
  const cut = text.slice(0, CARD_OVERVIEW_MAX);
  const lastSpace = cut.lastIndexOf(" ");
  const clipped = lastSpace > CARD_OVERVIEW_MAX * 0.6 ? cut.slice(0, lastSpace) : cut;
  return `${clipped.replace(/[\s.,;:!-]+$/, "")}…`;
}
