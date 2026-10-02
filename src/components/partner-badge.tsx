// The Partner label for companies whose partner application an admin
// approved (companies.is_partner).
export function PartnerBadge({ partnerType }: { partnerType?: string | null }) {
  return (
    <span
      className="partner-label"
      title={partnerType ? `GovConUnited Partner · ${partnerType}` : "GovConUnited Partner"}
      style={{
        display: "inline-flex",
        alignItems: "center",
        fontSize: 12,
        fontWeight: 600,
        lineHeight: 1.4,
        padding: "2px 8px",
        borderRadius: 999,
        color: "#fff",
        background: "var(--o-blue, #0063a8)",
        whiteSpace: "nowrap",
        flex: "none",
        verticalAlign: "middle",
      }}
    >
      Partner
    </span>
  );
}
