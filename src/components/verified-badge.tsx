export function VerifiedBadge({ size = 14 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      role="img"
      aria-label="Verified"
      style={{ display: "inline-block", verticalAlign: "middle", marginLeft: 4, flex: "none" }}
    >
      <circle cx="12" cy="12" r="12" fill="#ed1c24" />
      <path
        d="M7 12.5l3 3 7-7"
        fill="none"
        stroke="#fff"
        strokeWidth="2.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
