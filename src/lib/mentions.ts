// Shared mention markup: a mentioned member is stored inline in a post/
// comment's plain-text body as `@[Full Name](memberId)` — same idea as a
// Markdown link, chosen so no new column/migration is needed on
// posts/post_comments (both are plain `body text`). extractMentionedIds
// (server) and MentionText (client) both parse this same pattern; a fresh
// RegExp is returned per call rather than one shared module-level
// instance, since a global-flag regex mutates its own lastIndex and reuse
// across concurrent renders/calls would corrupt that state.
const MENTION_SOURCE = String.raw`@\[([^\]]+)\]\(([0-9a-fA-F-]{36})\)`;

export function mentionPattern(): RegExp {
  return new RegExp(MENTION_SOURCE, "g");
}

export function formatMention(name: string, id: string): string {
  return `@[${name}](${id})`;
}

export function extractMentionedIds(text: string): string[] {
  const ids = new Set<string>();
  for (const match of text.matchAll(mentionPattern())) ids.add(match[2]);
  return [...ids];
}

// For anywhere a body is shown as plain text (notification title/body,
// email) rather than through MentionText's link-rendering — "@[Name](id)"
// would otherwise leak into the raw excerpt.
export function stripMentionMarkup(text: string): string {
  return text.replace(mentionPattern(), (_match, name: string) => `@${name}`);
}
