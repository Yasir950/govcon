import type { CSSProperties } from "react";
import { toneFor } from "@/lib/avatar-tone";

export function CompanyLogo({
  name,
  initials,
  logoUrl,
  className,
  style,
  alt,
}: {
  name: string;
  initials: string;
  logoUrl?: string | null;
  className: string;
  style?: CSSProperties;
  alt?: string;
}) {
  if (logoUrl) {
    return <img src={logoUrl} alt={alt ?? `${name} logo`} className={className} style={{ objectFit: "cover", ...style }} />;
  }

  return (
    <span className={className} data-tone={toneFor(name)} role="img" aria-label={alt ?? `${name} logo`} style={style}>
      {initials}
    </span>
  );
}
