// Rich text for community posts and comments, stored as a small Reddit-style
// Markdown subset inside the existing plain-text `body` columns (no schema
// change, and older plain-text bodies render exactly as before). Parsing
// produces a tree that RichText renders as React elements — never raw
// HTML — so user content can't inject markup. @[Name](id) mentions (see
// mentions.ts) are recognized as their own inline token.
//
// Supported: **bold**, *italic* / _italic_, ~~strike~~, ^sup / ^(sup text),
// `code`, >!spoiler!<, [text](https://link), # headings, > quotes,
// - bullet and 1. numbered lists, ``` code blocks, and | pipe | tables.
// A backslash escapes any marker character (\* \# \- ...) — the WYSIWYG
// editor (rich-text-dom.ts) writes those so literal text stays literal.

export type Inline =
  | { t: "text"; v: string }
  | { t: "mention"; name: string; id: string }
  | { t: "code"; v: string }
  | { t: "link"; href: string; children: Inline[] }
  | { t: "b" | "i" | "s" | "sup" | "spoiler"; children: Inline[] };

export type Block =
  | { t: "p"; lines: Inline[][] }
  | { t: "h"; level: 1 | 2 | 3; children: Inline[] }
  | { t: "quote"; blocks: Block[] }
  | { t: "ul" | "ol"; items: Inline[][] }
  | { t: "pre"; v: string }
  | { t: "table"; head: Inline[][]; rows: Inline[][][] };

const INLINE_SOURCE = [
  String.raw`(?<esc>\\(?<escV>[\\` + "`" + String.raw`*_~^\[\]()#>!|+\-.<]))`,
  String.raw`(?<mention>@\[(?<mName>[^\]]+)\]\((?<mId>[0-9a-fA-F-]{36})\))`,
  String.raw`(?<code>` + "`" + String.raw`(?<codeV>[^` + "`" + String.raw`\n]+)` + "`" + `)`,
  String.raw`(?<link>\[(?<lText>[^\]\n]+)\]\((?<lHref>https?:\/\/[^\s)]+)\))`,
  // (?!\*) so ***both*** closes on the last pair: bold around *italic*.
  String.raw`(?<bold>\*\*(?<bV>[^\n]+?)\*\*(?!\*))`,
  String.raw`(?<strike>~~(?<sV>[^\n]+?)~~)`,
  String.raw`(?<spoiler>>!(?<spV>[^\n]+?)!<)`,
  // *italic* may contain **bold** and escaped \* characters.
  String.raw`(?<italic>\*(?![*\s])(?<iV>(?:\*\*[^\n]+?\*\*|\\.|[^*\n])+?)\*(?!\*)|` +
    String.raw`(?<![\w])_(?<iV2>[^_\n]+?)_(?![\w]))`,
  String.raw`(?<sup>\^\((?<supV>[^)\n]+)\)|\^(?<supV2>[^\s^]+))`,
].join("|");

export function parseInline(text: string): Inline[] {
  const out: Inline[] = [];
  const re = new RegExp(INLINE_SOURCE, "g");
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) {
    if (m.index > last) out.push({ t: "text", v: text.slice(last, m.index) });
    const g = m.groups!;
    if (g.esc) out.push({ t: "text", v: g.escV });
    else if (g.mention) out.push({ t: "mention", name: g.mName, id: g.mId });
    else if (g.code) out.push({ t: "code", v: g.codeV });
    else if (g.link) out.push({ t: "link", href: g.lHref, children: parseInline(g.lText) });
    else if (g.bold) out.push({ t: "b", children: parseInline(g.bV) });
    else if (g.strike) out.push({ t: "s", children: parseInline(g.sV) });
    else if (g.spoiler) out.push({ t: "spoiler", children: parseInline(g.spV) });
    else if (g.italic) out.push({ t: "i", children: parseInline(g.iV ?? g.iV2) });
    else if (g.sup) out.push({ t: "sup", children: parseInline(g.supV ?? g.supV2) });
    last = m.index + m[0].length;
  }
  if (last < text.length) out.push({ t: "text", v: text.slice(last) });
  return out;
}

const BULLET = /^\s*[-*+]\s+(.*)$/;
const ORDERED = /^\s*\d+[.)]\s+(.*)$/;
const HEADING = /^(#{1,3})\s+(.*)$/;
const QUOTE = /^>(?!!)\s?(.*)$/;
const TABLE_SEP = /^\|?\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)*\|?\s*$/;

function splitRow(line: string): string[] {
  return line
    .trim()
    .replace(/^\|/, "")
    .replace(/\|$/, "")
    .split("|")
    .map((c) => c.trim());
}

export function parseBlocks(text: string): Block[] {
  const lines = text.replace(/\r\n?/g, "\n").split("\n");
  const blocks: Block[] = [];
  let para: string[] = [];
  const flush = () => {
    if (para.length) blocks.push({ t: "p", lines: para.map(parseInline) });
    para = [];
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    if (line.trim().startsWith("```")) {
      flush();
      const code: string[] = [];
      i++;
      while (i < lines.length && !lines[i].trim().startsWith("```")) code.push(lines[i++]);
      blocks.push({ t: "pre", v: code.join("\n") });
      continue;
    }
    if (!line.trim()) {
      flush();
      continue;
    }
    const heading = HEADING.exec(line);
    if (heading) {
      flush();
      blocks.push({ t: "h", level: heading[1].length as 1 | 2 | 3, children: parseInline(heading[2]) });
      continue;
    }
    if (QUOTE.test(line)) {
      flush();
      const quoted: string[] = [];
      while (i < lines.length && QUOTE.test(lines[i])) quoted.push(QUOTE.exec(lines[i++])![1]);
      i--;
      blocks.push({ t: "quote", blocks: parseBlocks(quoted.join("\n")) });
      continue;
    }
    if (BULLET.test(line) || ORDERED.test(line)) {
      flush();
      const kind = BULLET.test(line) ? BULLET : ORDERED;
      const items: Inline[][] = [];
      while (i < lines.length && kind.test(lines[i])) items.push(parseInline(kind.exec(lines[i++])![1]));
      i--;
      blocks.push({ t: kind === BULLET ? "ul" : "ol", items });
      continue;
    }
    if (line.trim().startsWith("|") && i + 1 < lines.length && TABLE_SEP.test(lines[i + 1])) {
      flush();
      const head = splitRow(line).map(parseInline);
      i += 2;
      const rows: Inline[][][] = [];
      while (i < lines.length && lines[i].trim().startsWith("|")) rows.push(splitRow(lines[i++]).map(parseInline));
      i--;
      blocks.push({ t: "table", head, rows });
      continue;
    }
    para.push(line);
  }
  flush();
  return blocks;
}

function inlineToText(nodes: Inline[]): string {
  return nodes
    .map((n) => {
      if (n.t === "text" || n.t === "code") return n.v;
      if (n.t === "mention") return `@${n.name}`;
      if (n.t === "spoiler") return "[spoiler]";
      return inlineToText(n.children);
    })
    .join("");
}

function blocksToText(blocks: Block[]): string[] {
  return blocks.flatMap((b) => {
    if (b.t === "p") return b.lines.map(inlineToText);
    if (b.t === "h") return [inlineToText(b.children)];
    if (b.t === "quote") return blocksToText(b.blocks);
    if (b.t === "pre") return [b.v];
    if (b.t === "table") return [b.head, ...b.rows].map((row) => row.map(inlineToText).join(" · "));
    return b.items.map((item) => `• ${inlineToText(item)}`);
  });
}

// Plain-text version of a rich body for excerpts, previews, notifications
// and metadata — formatting markers and mention markup removed.
export function stripRichText(text: string): string {
  return blocksToText(parseBlocks(text)).join("\n");
}
