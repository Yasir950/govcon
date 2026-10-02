"use client";

import Link from "next/link";
import { mentionPattern } from "@/lib/mentions";

// Renders a post/comment body with any @[Name](id) markup turned into a
// real link to that member's profile, plain text everywhere else. The
// stored body is plain text (see mentions.ts for why), so this is the one
// place that markup is ever meant to reach a screen — every other
// consumer (notification excerpts, email) should go through
// stripMentionMarkup instead.
export function MentionText({ text }: { text: string }) {
  const regex = mentionPattern();
  const parts: React.ReactNode[] = [];
  let lastIndex = 0;
  let key = 0;
  let match: RegExpExecArray | null;

  while ((match = regex.exec(text))) {
    if (match.index > lastIndex) parts.push(text.slice(lastIndex, match.index));
    const [, name, id] = match;
    parts.push(
      <Link key={key++} href={`/network/${id}`} className="mention-link">
        @{name}
      </Link>,
    );
    lastIndex = match.index + match[0].length;
  }
  if (lastIndex < text.length) parts.push(text.slice(lastIndex));

  return <>{parts}</>;
}
