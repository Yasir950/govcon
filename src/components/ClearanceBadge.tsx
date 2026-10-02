// Declared clearance plus whether an admin verified it against uploaded
// proof (network_members.clearance_verified). Renders nothing when no
// clearance is declared.
export function ClearanceBadge({ clearance, verified }: { clearance: string | null; verified: boolean }) {
  if (!clearance) return null;
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
      <span>Clearance: {clearance}</span>
      <span
        style={{
          fontSize: 11.5,
          fontWeight: 600,
          padding: "1px 8px",
          borderRadius: 999,
          color: verified ? "#067647" : "#475467",
          background: verified ? "#dcfae6" : "#f2f4f7",
          whiteSpace: "nowrap",
        }}
      >
        {verified ? "✓ Verified" : "Unverified"}
      </span>
    </span>
  );
}
