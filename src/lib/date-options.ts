export const MONTH_OPTIONS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

// Descending so "current year" sits at the top of the dropdown, matching
// LinkedIn's own Start/End year pickers.
export function yearOptions(count = 80): number[] {
  const current = new Date().getFullYear();
  return Array.from({ length: count }, (_, i) => current + 1 - i);
}

// Composes a display label from a select-driven month/year pair — month is
// optional (education dates often only carry a year), year alone still
// renders as e.g. "2019".
export function formatMonthYear(month: string, year: string): string {
  if (!year) return "";
  if (!month) return year;
  const short = month.slice(0, 3);
  return `${short} ${year}`;
}

const MONTH_ABBR_TO_FULL: Record<string, string> = Object.fromEntries(
  MONTH_OPTIONS.map((m) => [m.slice(0, 3), m]),
);

// Reverses formatMonthYear's output ("Mon Year" or bare "Year") back into
// the month/year select values that produced it, so an edit form can
// prefill from a stored label — there's no separate raw month/year column,
// the label is the only record of what was picked.
export function parseMonthYear(label: string): { month: string; year: string } {
  const monthYear = label.match(/^([A-Za-z]{3}) (\d{4})$/);
  if (monthYear) return { month: MONTH_ABBR_TO_FULL[monthYear[1]] ?? "", year: monthYear[2] };
  if (/^\d{4}$/.test(label)) return { month: "", year: label };
  return { month: "", year: "" };
}

// LinkedIn-style tenure ("2 yrs 3 mos") between two stored labels, counting
// both the start and end month. "Present" (or any unparseable end) means
// today; a year-only label counts from January. Null when the start can't be
// read or the range runs backwards.
export function formatDuration(startLabel: string, endLabel: string, now = new Date()): string | null {
  const toIndex = (label: string): number | null => {
    const { month, year } = parseMonthYear(label);
    if (!year) return null;
    const m = month ? MONTH_OPTIONS.indexOf(month) : 0;
    return Number(year) * 12 + Math.max(m, 0);
  };
  const start = toIndex(startLabel);
  if (start === null) return null;
  const end = toIndex(endLabel) ?? now.getFullYear() * 12 + now.getMonth();
  const total = end - start + 1;
  if (total <= 0) return null;
  const years = Math.floor(total / 12);
  const months = total % 12;
  const parts = [
    years ? `${years} yr${years === 1 ? "" : "s"}` : "",
    months ? `${months} mo${months === 1 ? "" : "s"}` : "",
  ].filter(Boolean);
  return parts.join(" ");
}
