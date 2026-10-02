export function ProBadge({ size = 18 }: { size?: number }) {
  return (
    // Capital "I" matches the asset's actual committed path
    // (public/Icons/pro.png) — Windows dev serves /icons/pro.png fine too
    // (case-insensitive filesystem), but production is case-sensitive and
    // 404s on a mismatch.
    <img
      src="/Icons/pro.png"
      alt="Pro"
      title="GovConUnited Pro member"
      width={size}
      height={size}
      // width/height set again inline (not just as attributes) — several
      // surfaces this badge renders inside (e.g. the landing page's
      // .connection-card) have a generic `img{width:78px;height:78px}`
      // rule for their own avatar photo that would otherwise blow this
      // badge up to the same size, since a CSS rule beats a plain HTML
      // width/height attribute.
      style={{
        display: "inline-block",
        verticalAlign: "middle",
        marginLeft: 4,
        flex: "none",
        width: size,
        height: size,
        maxWidth: size,
        maxHeight: size,
      }}
    />
  );
}
