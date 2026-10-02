import {
  Award,
  BadgeCheck,
  BookOpen,
  Brush,
  Building,
  Cake,
  CalendarCheck,
  CircleCheck,
  ClipboardCheck,
  Clock,
  Compass,
  FileCheck,
  Flag,
  Flame,
  Flower2,
  Gavel,
  GraduationCap,
  Handshake,
  Lightbulb,
  Link2,
  Lock,
  Medal,
  Users,
  MessageSquare,
  Moon,
  PenLine,
  Puzzle,
  Podium,
  Quote,
  ShieldCheck,
  Sparkles,
  Star,
  Target,
  Telescope,
  Trophy,
  UserSearch,
  Vote,
  Zap,
  type LucideIcon,
} from "lucide-react";
import { TIER_COLORS, type EarnedBadge } from "@/lib/points-types";

// badges.icon → lucide glyph (see the badges seed in
// 20260929000500_points_schema.sql).
const ICONS: Record<string, LucideIcon> = {
  check: CircleCheck,
  flame: Flame,
  sweep: Brush,
  pen: PenLine,
  chat: MessageSquare,
  bulb: Lightbulb,
  bolt: Zap,
  star: Star,
  trophy: Trophy,
  link: Link2,
  scout: UserSearch,
  quote: Quote,
  handshake: Handshake,
  calendar: CalendarCheck,
  target: Target,
  shield: ShieldCheck,
  building: Building,
  flag: Flag,
  cake: Cake,
  podium: Podium,
  gavel: Gavel,
  sparkle: Sparkles,
  moon: Moon,
  clock: Clock,
  flower: Flower2,
  medal: Award,
  lock: Lock,
  compass: Compass,
  bid: FileCheck,
  poll: Vote,
  review: ClipboardCheck,
  puzzle: Puzzle,
  mentor: GraduationCap,
  win: Medal,
  buddies: Users,
  book: BookOpen,
  certified: BadgeCheck,
  oracle: Telescope,
};

export function BadgeIcon({
  icon,
  tier,
  size = 36,
  locked = false,
  title,
}: {
  icon: string;
  tier: EarnedBadge["tier"];
  size?: number;
  locked?: boolean;
  title?: string;
}) {
  const Icon = locked ? Lock : (ICONS[icon] ?? Award);
  const color = locked ? "#9aa4b2" : TIER_COLORS[tier];
  return (
    // `title` renders as an instant styled tooltip (points.css), not the
    // native one, which is delayed and never shows on touch.
    <span
      className={`points-badge-icon${locked ? " is-locked" : ""}${title ? " has-tip" : ""}`}
      data-tip={title}
      role={title ? "img" : undefined}
      aria-label={title}
      tabIndex={title ? 0 : undefined}
      style={{
        width: size,
        height: size,
        borderColor: color,
        color,
        background: locked ? "#f1f3f6" : `${color}14`,
      }}
    >
      <Icon size={Math.round(size * 0.52)} strokeWidth={2} aria-hidden="true" />
    </span>
  );
}

// Badges whose names already say the place (the season podium) skip the
// "· Silver" suffix.
const SELF_TIERED = new Set(["Season Top 10", "Season Top 3", "Season Champion"]);

export function tierLabel(tier: EarnedBadge["tier"], name?: string) {
  if (tier === "single" || (name && SELF_TIERED.has(name))) return "";
  return tier[0].toUpperCase() + tier.slice(1);
}
