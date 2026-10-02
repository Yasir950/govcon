// The "Open to" catalog a member picks from on their profile (stored in
// profiles.open_to as an ordered text[]; array order is the member's own
// drag-to-reorder priority). Up to OPEN_TO_MAX choices; the first
// OPEN_TO_TAG_COUNT *public* ones show as tags under the member's name, and
// all of them count for search, filtering and match suggestions.
//
// The Careers group is never a public tag — it's only shown to verified
// company accounts (see canSeeCareerOpenTo) and to the member themselves.

export const OPEN_TO_MAX = 10;
export const OPEN_TO_TAG_COUNT = 5;

export const OPEN_TO_GROUPS = [
  {
    label: "Partnering",
    options: [
      "Teaming partners",
      "Joint ventures",
      "Subcontracting to primes (I want to be a sub)",
      "Hiring subcontractors (I'm a prime)",
      "Mentor-Protégé: as a mentor",
      "Mentor-Protégé: as a protégé",
      "Set-aside partners (8(a), HUBZone, SDVOSB, WOSB)",
      "Small business partners for prime subcontracting plans",
      "Strategic alliances",
      "Contract vehicle partners (GSA MAS, NASA SEWP, OASIS+)",
      "SBIR/STTR research partners",
      "Federal lab and university research partnerships (CRADAs)",
      "International and Foreign Military Sales (FMS) partners",
    ],
  },
  {
    label: "Selling and sourcing",
    options: [
      "Selling products",
      "Selling services",
      "Finding suppliers and vendors",
      "Manufacturing and fabrication partners",
      "Resellers and distributors",
      "Past performance references (giving or requesting)",
    ],
  },
  {
    label: "Capture and proposals",
    options: [
      "Proposal and capture support",
      "Freelance proposal writing",
      "Pricing and cost volume support",
      "Proposal color team reviews (Pink, Red, Gold)",
      "Bid/no-bid advisory",
      "Opportunity and market research",
    ],
  },
  {
    label: "Compliance and certifications",
    options: [
      "Consulting engagements",
      "Contracts and compliance (FAR, DFARS)",
      "Cybersecurity compliance (CMMC, NIST 800-171, FedRAMP)",
      "Small business certification help (8(a), HUBZone, SDVOSB, WOSB)",
      "Security clearance and facility clearance (FCL) sponsorship",
      "GSA Schedule setup and management",
    ],
  },
  {
    label: "Growth and funding",
    options: [
      "Investment and acquisitions",
      "Selling or exiting a GovCon business",
      "Raising capital",
      "Contract financing and lines of credit",
      "Mergers and acquisitions advisory",
    ],
  },
  {
    label: "Leadership and expertise",
    options: [
      "Board and advisory roles",
      "Speaking",
      "Mentoring",
      "Podcasts and interviews",
      "Writing and thought leadership",
      "Training and workshops",
      "Co-hosting events and webinars",
    ],
  },
  {
    label: "Careers",
    careers: true,
    options: ["Full-time roles", "Part-time roles", "Contract and 1099 roles", "Cleared roles only", "Internships"],
  },
] as const satisfies readonly { label: string; careers?: boolean; options: readonly string[] }[];

export const OPEN_TO_OPTIONS: readonly string[] = OPEN_TO_GROUPS.flatMap((g) => g.options);
const OPTION_SET = new Set(OPEN_TO_OPTIONS);
const CAREER_SET = new Set<string>(OPEN_TO_GROUPS.find((g) => "careers" in g)!.options);

export function isCareerOpenTo(option: string): boolean {
  return CAREER_SET.has(option);
}

// Keeps stored order, drops unknown values and duplicates, and caps at
// OPEN_TO_MAX. Used both when reading and when saving.
export function normalizeOpenTo(values: readonly string[] | null | undefined): string[] {
  const out: string[] = [];
  for (const v of values ?? []) {
    if (OPTION_SET.has(v) && !out.includes(v)) out.push(v);
    if (out.length === OPEN_TO_MAX) break;
  }
  return out;
}

export function publicOpenTo(values: readonly string[]): string[] {
  return values.filter((v) => !CAREER_SET.has(v));
}

// Choices that pair one member's need with another's offer, used to rank
// match suggestions. Symmetric: listed once, checked both ways.
const COMPLEMENTS: [string, string][] = [
  ["Subcontracting to primes (I want to be a sub)", "Hiring subcontractors (I'm a prime)"],
  ["Small business partners for prime subcontracting plans", "Subcontracting to primes (I want to be a sub)"],
  ["Mentor-Protégé: as a mentor", "Mentor-Protégé: as a protégé"],
  ["Mentoring", "Mentor-Protégé: as a protégé"],
  ["Selling products", "Finding suppliers and vendors"],
  ["Selling services", "Finding suppliers and vendors"],
  ["Manufacturing and fabrication partners", "Finding suppliers and vendors"],
  ["Resellers and distributors", "Selling products"],
  ["Investment and acquisitions", "Selling or exiting a GovCon business"],
  ["Investment and acquisitions", "Raising capital"],
  ["Contract financing and lines of credit", "Raising capital"],
  ["Mergers and acquisitions advisory", "Selling or exiting a GovCon business"],
  ["Freelance proposal writing", "Proposal and capture support"],
  ["Podcasts and interviews", "Speaking"],
  ["Co-hosting events and webinars", "Speaking"],
];
const COMPLEMENT_MAP = new Map<string, Set<string>>();
for (const [a, b] of COMPLEMENTS) {
  if (!COMPLEMENT_MAP.has(a)) COMPLEMENT_MAP.set(a, new Set());
  if (!COMPLEMENT_MAP.has(b)) COMPLEMENT_MAP.set(b, new Set());
  COMPLEMENT_MAP.get(a)!.add(b);
  COMPLEMENT_MAP.get(b)!.add(a);
}

// Mutual "open to" choices score 1 each; complementary pairs (a sub and a
// prime hiring subs) score 2 each. All choices count, not just the top 5.
export function openToMatchScore(mine: readonly string[], theirs: readonly string[]): number {
  if (!mine.length || !theirs.length) return 0;
  const theirSet = new Set(theirs);
  let score = 0;
  for (const m of mine) {
    if (theirSet.has(m)) score += 1;
    for (const c of COMPLEMENT_MAP.get(m) ?? []) if (theirSet.has(c)) score += 2;
  }
  return score;
}
