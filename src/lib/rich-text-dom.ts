// Browser-side bridge between the stored Markdown subset (lib/rich-text.ts)
// and the WYSIWYG editor's contentEditable DOM: markdownToHtml seeds the
// editor from a saved body, domToMarkdown turns what the member edited back
// into the same Markdown. Storage and rendering stay Markdown → React, so
// nothing outside the editor ever handles HTML.

import { parseBlocks, type Block, type Inline } from "@/lib/rich-text";

const escapeHtml = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

// A mention is one uneditable chip, so backspace removes it whole.
export function mentionChipHtml(name: string, id: string) {
  return `<span class="mention-chip" contenteditable="false" data-mention-id="${escapeHtml(id)}" data-mention-name="${escapeHtml(name)}">@${escapeHtml(name)}</span>`;
}

function inlineHtml(nodes: Inline[]): string {
  return nodes
    .map((n) => {
      switch (n.t) {
        case "text":
          return escapeHtml(n.v);
        case "mention":
          return mentionChipHtml(n.name, n.id);
        case "code":
          return `<code>${escapeHtml(n.v)}</code>`;
        case "link":
          return `<a href="${escapeHtml(n.href)}">${inlineHtml(n.children)}</a>`;
        case "b":
          return `<strong>${inlineHtml(n.children)}</strong>`;
        case "i":
          return `<em>${inlineHtml(n.children)}</em>`;
        case "s":
          return `<s>${inlineHtml(n.children)}</s>`;
        case "sup":
          return `<sup>${inlineHtml(n.children)}</sup>`;
        case "spoiler":
          return `<span class="rt-spoiler">${inlineHtml(n.children)}</span>`;
      }
    })
    .join("");
}

function blocksHtml(blocks: Block[]): string {
  return blocks
    .map((b) => {
      switch (b.t) {
        case "p":
          return `<p>${b.lines.map(inlineHtml).join("<br>")}</p>`;
        case "h":
          return `<h${b.level + 1}>${inlineHtml(b.children)}</h${b.level + 1}>`;
        case "quote":
          return `<blockquote>${blocksHtml(b.blocks)}</blockquote>`;
        case "ul":
        case "ol":
          return `<${b.t}>${b.items.map((item) => `<li>${inlineHtml(item) || "<br>"}</li>`).join("")}</${b.t}>`;
        case "pre":
          return `<pre>${escapeHtml(b.v) || "<br>"}</pre>`;
        case "table": {
          const row = (cells: Inline[][], tag: "th" | "td") =>
            `<tr>${cells.map((c) => `<${tag}>${inlineHtml(c) || "<br>"}</${tag}>`).join("")}</tr>`;
          return `<table><thead>${row(b.head, "th")}</thead><tbody>${b.rows.map((r) => row(r, "td")).join("")}</tbody></table>`;
        }
      }
    })
    .join("");
}

export function markdownToHtml(markdown: string): string {
  return markdown.trim() ? blocksHtml(parseBlocks(markdown)) : "";
}

// ── DOM → Markdown ──

const BLOCK_TAGS = new Set(["P", "DIV", "H1", "H2", "H3", "H4", "H5", "H6", "BLOCKQUOTE", "UL", "OL", "LI", "PRE", "TABLE"]);
const MERGEABLE = new Set(["B", "STRONG", "I", "EM", "S", "STRIKE", "DEL", "SUP", "CODE"]);
const ZWSP = "​";

// Escapes characters the parser would otherwise read as formatting.
function escapeText(text: string): string {
  return text
    .replace(/ /g, " ")
    .replace(/[\\`*~^[]/g, "\\$&")
    .replace(/_/g, (m, offset: number, str: string) =>
      /\w/.test(str[offset - 1] ?? "") && /\w/.test(str[offset + 1] ?? "") ? m : "\\_",
    )
    .replace(/>!/g, ">\\!")
    .replace(/!</g, "\\!<");
}

// A paragraph line that would start a heading, quote, list or table.
function escapeLineStart(line: string): string {
  return line.replace(/^(\s*)(>(?!!)|[#|+-])/, "$1\\$2").replace(/^(\s*\d+)([.)])(?=\s)/, "$1\\$2");
}

// Wraps each line's non-space content in markers — "** bold**" wouldn't
// parse, and inline markers can't span lines.
function mark(inner: string, open: string, close: string): string {
  return inner
    .split("\n")
    .map((line) => {
      const m = /^(\s*)(.*?)(\s*)$/.exec(line)!;
      return m[2] ? m[1] + open + m[2] + close + m[3] : line;
    })
    .join("\n");
}

// Joins serialized siblings; a zero-width space keeps "**a**" + "*b*" from
// fusing into an unparseable "**a***b*".
function joinPieces(pieces: string[]): string {
  let out = "";
  for (const piece of pieces) {
    if (!piece) continue;
    const last = out[out.length - 1];
    if (last && last === piece[0] && (last === "*" || last === "~") && out[out.length - 2] !== "\\") out += ZWSP;
    out += piece;
  }
  return out;
}

function inline(node: Node, active: Set<string>): string {
  if (node.nodeType === Node.TEXT_NODE) return escapeText(node.textContent ?? "");
  if (node.nodeType !== Node.ELEMENT_NODE) return "";
  const el = node as HTMLElement;
  if (el.dataset.mentionId) return `@[${el.dataset.mentionName ?? ""}](${el.dataset.mentionId})`;

  const children = (extra?: string) => {
    const next = extra ? new Set(active).add(extra) : active;
    return joinPieces(Array.from(el.childNodes).map((c) => inline(c, next)));
  };
  // Nested duplicates (<b><b>x</b></b>) emit their markers only once.
  const styled = (kind: string, open: string, close: string) =>
    active.has(kind) ? children() : mark(children(kind), open, close);

  switch (el.tagName) {
    case "BR":
      return "\n";
    case "B":
    case "STRONG":
      return styled("b", "**", "**");
    case "I":
    case "EM":
      return styled("i", "*", "*");
    case "S":
    case "STRIKE":
    case "DEL":
      return styled("s", "~~", "~~");
    case "SUP":
      return styled("sup", "^(", ")");
    case "CODE": {
      const text = (el.textContent ?? "").replace(/[`\n]/g, "").replace(/ /g, " ");
      return text.trim() ? "`" + text + "`" : text;
    }
    case "A": {
      const href = el.getAttribute("href") ?? "";
      const text = children().replace(/\n/g, " ");
      return /^https?:\/\/[^\s)]+$/i.test(href) && text.trim() ? `[${text}](${href})` : text;
    }
    case "SPAN":
      return el.classList.contains("rt-spoiler") ? styled("spoiler", ">!", "!<") : children();
    case "P":
    case "DIV":
    case "LI":
      return children() + "\n";
    default:
      return children();
  }
}

function inlineOf(nodes: Node[]): string {
  return joinPieces(nodes.map((n) => inline(n, new Set())));
}

function paragraph(nodes: Node[]): string {
  return inlineOf(nodes)
    .split("\n")
    .map((line) => (line.trim() ? escapeLineStart(line.replace(/\s+$/, "")) : ""))
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function listItems(list: Element, ordered: boolean): string[] {
  const items: string[] = [];
  for (const li of Array.from(list.children)) {
    const own = Array.from(li.childNodes).filter((c) => !(c instanceof Element && (c.tagName === "UL" || c.tagName === "OL")));
    const text = inlineOf(own).replace(/\s*\n\s*/g, " ").trim();
    if (text) items.push(text);
    for (const nested of Array.from(li.children).filter((c) => c.tagName === "UL" || c.tagName === "OL")) {
      items.push(...listItems(nested, ordered));
    }
  }
  return items;
}

function blocks(container: Node): string[] {
  const out: string[] = [];
  let para: Node[] = [];
  const flush = () => {
    if (!para.length) return;
    const text = paragraph(para);
    if (text) out.push(text);
    para = [];
  };

  for (const node of Array.from(container.childNodes)) {
    const el = node instanceof HTMLElement ? node : null;
    if (!el || !BLOCK_TAGS.has(el.tagName)) {
      para.push(node);
      continue;
    }
    flush();
    const tag = el.tagName;
    if (tag === "P" || tag === "DIV" || tag === "LI") {
      if (Array.from(el.children).some((c) => BLOCK_TAGS.has(c.tagName))) out.push(...blocks(el));
      else {
        const text = paragraph(Array.from(el.childNodes));
        if (text) out.push(text);
      }
    } else if (/^H[1-6]$/.test(tag)) {
      const text = inlineOf(Array.from(el.childNodes)).replace(/\s*\n\s*/g, " ").trim();
      const level = Math.min(3, Math.max(1, Number(tag[1]) - 1));
      if (text) out.push(`${"#".repeat(level)} ${text}`);
    } else if (tag === "BLOCKQUOTE") {
      const inner = blocks(el).join("\n\n");
      if (inner.trim()) out.push(inner.split("\n").map((l) => (l ? `> ${l}` : ">")).join("\n"));
    } else if (tag === "UL" || tag === "OL") {
      const items = listItems(el, tag === "OL");
      if (items.length) out.push(items.map((item, i) => (tag === "OL" ? `${i + 1}. ` : "- ") + item).join("\n"));
    } else if (tag === "PRE") {
      const code = (el.innerText ?? el.textContent ?? "").replace(/ /g, " ").replace(/\n+$/, "").replace(/```/g, "``" + ZWSP + "`");
      if (code.trim()) out.push("```\n" + code + "\n```");
    } else if (tag === "TABLE") {
      const rows = Array.from(el.querySelectorAll("tr")).map((tr) =>
        Array.from(tr.children).map((cell) =>
          inlineOf(Array.from(cell.childNodes)).replace(/\s*\n\s*/g, " ").replace(/\|/g, "/").trim(),
        ),
      );
      const width = Math.max(0, ...rows.map((r) => r.length));
      if (width && rows.some((r) => r.some(Boolean))) {
        const line = (cells: string[]) => `| ${Array.from({ length: width }, (_, i) => cells[i] ?? "").join(" | ")} |`;
        out.push([line(rows[0]), line(Array(width).fill("---")), ...rows.slice(1).map(line)].join("\n"));
      }
    }
  }
  flush();
  return out;
}

// Merges adjacent identical formatting (<b>a</b><b>b</b>), which would
// otherwise serialize to "**a****b**".
function mergeAdjacent(root: Node) {
  let child = root.firstChild;
  while (child) {
    const next = child.nextSibling;
    if (
      child instanceof HTMLElement &&
      next instanceof HTMLElement &&
      child.tagName === next.tagName &&
      MERGEABLE.has(child.tagName)
    ) {
      while (next.firstChild) child.appendChild(next.firstChild);
      next.remove();
      continue;
    }
    mergeAdjacent(child);
    child = next;
  }
}

// The selection as character offsets into root's text. Chrome's list and
// block commands can drop the caret at the start of the line; restoring
// by text offset (which those commands don't change) puts it back.
export function getTextSelection(root: HTMLElement): { start: number; end: number } | null {
  const sel = window.getSelection();
  if (!sel?.rangeCount || !root.contains(sel.anchorNode)) return null;
  const range = sel.getRangeAt(0);
  const measure = (node: Node, offset: number) => {
    const r = document.createRange();
    r.selectNodeContents(root);
    r.setEnd(node, offset);
    return r.toString().length;
  };
  return { start: measure(range.startContainer, range.startOffset), end: measure(range.endContainer, range.endOffset) };
}

export function setTextSelection(root: HTMLElement, pos: { start: number; end: number }) {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  let seen = 0;
  let start: [Node, number] | null = null;
  let end: [Node, number] | null = null;
  for (let node = walker.nextNode(); node && !end; node = walker.nextNode()) {
    const len = (node as Text).length;
    if (!start && pos.start <= seen + len) start = [node, pos.start - seen];
    if (start && pos.end <= seen + len) end = [node, pos.end - seen];
    seen += len;
  }
  if (!start || !end) return;
  const range = document.createRange();
  range.setStart(...start);
  range.setEnd(...end);
  window.getSelection()?.removeAllRanges();
  window.getSelection()?.addRange(range);
}

export function domToMarkdown(root: HTMLElement): string {
  // innerText (used for code blocks) needs a rendered element, so work on
  // the live DOM for <pre> and a clone for the structural merge.
  const clone = root.cloneNode(true) as HTMLElement;
  const livePres = Array.from(root.querySelectorAll("pre"));
  Array.from(clone.querySelectorAll("pre")).forEach((pre, i) => {
    pre.textContent = livePres[i]?.innerText ?? pre.textContent;
  });
  clone.normalize();
  mergeAdjacent(clone);
  return blocks(clone).join("\n\n").trim();
}
