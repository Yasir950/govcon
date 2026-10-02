import { toneFor } from "@/lib/avatar-tone";

export function initialsOf(name: string): string {
  return (
    name
      .split(" ")
      .filter(Boolean)
      .map((w) => w[0])
      .slice(0, 2)
      .join("")
      .toUpperCase() || "GC"
  );
}

// Mirrors the .company-logo-avatar[data-tone] gradients in landing.css —
// duplicated here (not just `className="company-logo-avatar"`) because
// that class is scoped under `.opps-app`, which this component is
// deliberately NOT scoped to: it renders inside DashboardShell's persistent
// header/sidebar chrome (outside .opps-app) just as often as inside a
// page's own .opps-app content, and a member's circular photo-or-initials
// badge needs to look right in both places, not just one of them.
const TONE_GRADIENTS: Record<string, string> = {
  blue: "linear-gradient(145deg, var(--o-blue-dark, #07173f), var(--o-blue, #0a66c2))",
  red: "linear-gradient(145deg, #a50811, #f34a50)",
  green: "linear-gradient(145deg, #075f43, #20a875)",
  purple: "linear-gradient(145deg, #44227a, #8c63d8)",
  gold: "linear-gradient(145deg, #9a5c00, #f0b429)",
};

// The one real-photo-or-initials avatar renderer — every list, card, and
// hero across the app should render a member's photo through this instead
// of a one-off initials-only span, so a real avatar_url actually shows up
// everywhere a member appears, not just on their own profile page. Fully
// self-contained (inline styles only) so it renders identically regardless
// of ancestor context — see the TONE_GRADIENTS comment above for why.
export function Avatar({
  name,
  avatarUrl,
  size = 40,
}: {
  name: string;
  avatarUrl?: string | null;
  size?: number;
}) {
  if (avatarUrl) {
    return (
      <img
        src={avatarUrl}
        alt={name}
        style={{ width: size, height: size, borderRadius: "50%", objectFit: "cover", display: "block" }}
      />
    );
  }
  return (
    <span
      role="img"
      aria-label={name}
      style={{
        width: size,
        height: size,
        borderRadius: "50%",
        display: "grid",
        placeItems: "center",
        flex: "none",
        color: "#fff",
        background: TONE_GRADIENTS[toneFor(name)] ?? TONE_GRADIENTS.blue,
        fontSize: size * 0.38,
        fontWeight: 600,
        letterSpacing: "-0.02em",
      }}
    >
      {initialsOf(name)}
    </span>
  );
}
