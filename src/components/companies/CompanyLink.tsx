"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import type { CSSProperties, ReactNode } from "react";

// A company name that links to its profile. Falls back to plain text when
// there's no platform company behind the name (e.g. an agency-posted
// SAM.gov notice). Inherits the surrounding text style so it can drop into
// headings, meta lines and cards without restyling them; stopPropagation
// keeps it usable inside cards that are themselves clickable.
//
// `nested` is for names that sit inside another <a> (a row that links to
// a job/opportunity): <a> can't contain <a>, so it renders a span with
// link semantics that navigates on its own and swallows the outer click.
export function CompanyLink({
  slug,
  children,
  className,
  style,
  nested = false,
}: {
  slug: string | null | undefined;
  children: ReactNode;
  className?: string;
  style?: CSSProperties;
  nested?: boolean;
}) {
  const router = useRouter();

  if (!slug) {
    return (
      <span className={className} style={style}>
        {children}
      </span>
    );
  }

  const href = `/companies/${slug}`;
  const cls = `company-link${className ? ` ${className}` : ""}`;

  if (nested) {
    const go = (e: React.SyntheticEvent) => {
      e.preventDefault();
      e.stopPropagation();
      router.push(href);
    };
    return (
      <span
        role="link"
        tabIndex={0}
        className={cls}
        style={style}
        onClick={go}
        onKeyDown={(e) => {
          if (e.key === "Enter") go(e);
        }}
      >
        {children}
      </span>
    );
  }

  return (
    <Link href={href} className={cls} style={style} onClick={(e) => e.stopPropagation()}>
      {children}
    </Link>
  );
}
