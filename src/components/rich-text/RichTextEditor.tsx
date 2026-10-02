"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import {
  Bold,
  CaseSensitive,
  Code,
  EyeOff,
  Heading,
  Italic,
  Link as LinkIcon,
  List,
  ListOrdered,
  Quote,
  SquareCode,
  Strikethrough,
  Superscript,
  Table,
} from "lucide-react";
import { searchMentionCandidatesAction } from "@/app/(app)/communities/actions";
import { Avatar } from "@/components/avatar";
import {
  domToMarkdown,
  getTextSelection,
  markdownToHtml,
  mentionChipHtml,
  setTextSelection,
} from "@/lib/rich-text-dom";
import type { NetworkMember } from "@/lib/landing-data";

type ToolId =
  | "bold"
  | "italic"
  | "strike"
  | "sup"
  | "heading"
  | "link"
  | "ul"
  | "ol"
  | "spoiler"
  | "quote"
  | "code"
  | "codeblock"
  | "table";

const TOOLS: { id: ToolId; label: string; icon: React.ComponentType<{ size?: number }>; divider?: boolean }[] = [
  { id: "bold", label: "Bold", icon: Bold },
  { id: "italic", label: "Italic", icon: Italic },
  { id: "strike", label: "Strikethrough", icon: Strikethrough },
  { id: "sup", label: "Superscript", icon: Superscript },
  { id: "heading", label: "Heading", icon: Heading, divider: true },
  { id: "link", label: "Link", icon: LinkIcon },
  { id: "ul", label: "Bulleted list", icon: List },
  { id: "ol", label: "Numbered list", icon: ListOrdered, divider: true },
  { id: "spoiler", label: "Spoiler", icon: EyeOff },
  { id: "quote", label: "Quote", icon: Quote },
  { id: "code", label: "Code", icon: Code },
  { id: "codeblock", label: "Code block", icon: SquareCode },
  { id: "table", label: "Table", icon: Table },
];

const BLOCK_SELECTOR: Partial<Record<ToolId, string>> = {
  heading: "h1,h2,h3,h4,h5,h6",
  link: "a",
  ul: "ul",
  ol: "ol",
  spoiler: ".rt-spoiler",
  quote: "blockquote",
  code: "code",
  codeblock: "pre",
};

const COMMAND: Partial<Record<ToolId, string>> = {
  bold: "bold",
  italic: "italic",
  strike: "strikeThrough",
  sup: "superscript",
  ul: "insertUnorderedList",
  ol: "insertOrderedList",
};

type MentionState = { node: Text; start: number; query: string };

function placeCaret(node: Node, offset: number) {
  const range = document.createRange();
  range.setStart(node, offset);
  range.collapse(true);
  const sel = window.getSelection();
  sel?.removeAllRanges();
  sel?.addRange(range);
}

// Replaces a block element with a <p> holding its children.
function toParagraph(el: HTMLElement) {
  const p = document.createElement("p");
  while (el.firstChild) p.appendChild(el.firstChild);
  if (!p.firstChild) p.appendChild(document.createElement("br"));
  el.replaceWith(p);
  return p;
}

// Moves a block's children out in front of it and removes it. Loose
// inline content gets its own <p>.
function unwrapBlock(el: HTMLElement) {
  if (el.tagName === "PRE") {
    const lines = (el.innerText || "").replace(/\n$/, "").split("\n");
    const ps = lines.map((line) => {
      const p = document.createElement("p");
      p.textContent = line;
      if (!line) p.appendChild(document.createElement("br"));
      return p;
    });
    el.replaceWith(...ps);
    return ps[0];
  }
  const parent = el.parentNode!;
  let first: Node | null = null;
  let loose: HTMLElement | null = null;
  while (el.firstChild) {
    const child = el.firstChild;
    const isBlock = child instanceof HTMLElement && /^(P|DIV|H\d|UL|OL|PRE|TABLE|BLOCKQUOTE)$/.test(child.tagName);
    if (isBlock) {
      loose = null;
      parent.insertBefore(child, el);
      first ??= child;
    } else {
      if (!loose) {
        loose = document.createElement("p");
        parent.insertBefore(loose, el);
        first ??= loose;
      }
      loose.appendChild(child);
    }
  }
  el.remove();
  return first;
}

function unwrapInline(el: HTMLElement) {
  const parent = el.parentNode!;
  while (el.firstChild) parent.insertBefore(el.firstChild, el);
  el.remove();
}

// A Reddit-style WYSIWYG editor: members see bold as bold, lists as lists,
// with the formatting toolbar under the text. What it stores is still the
// Markdown subset lib/rich-text.ts parses (via rich-text-dom.ts).
// `footerStart`/`footerEnd` sit in the bottom row (media buttons on the
// left, Cancel/Submit on the right).
export function RichTextEditor({
  value,
  onChange,
  placeholder,
  autoFocus,
  disabled,
  minHeight = 80,
  defaultToolbarOpen = false,
  hideToolbarToggle = false,
  footerStart,
  footerEnd,
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  autoFocus?: boolean;
  disabled?: boolean;
  minHeight?: number;
  defaultToolbarOpen?: boolean;
  hideToolbarToggle?: boolean;
  footerStart?: React.ReactNode;
  footerEnd?: React.ReactNode;
}) {
  const editorRef = useRef<HTMLDivElement | null>(null);
  // The Markdown the editor DOM currently represents — a `value` that
  // differs came from outside (initial load, reset after submit) and
  // re-seeds the DOM; our own onChange echoes don't.
  const syncedValue = useRef<string | null>(null);
  const savedRange = useRef<Range | null>(null);
  const [toolbarOpen, setToolbarOpen] = useState(defaultToolbarOpen);
  const [empty, setEmpty] = useState(!value.trim());
  const [active, setActive] = useState<Partial<Record<ToolId, boolean>>>({});
  const [linkDraft, setLinkDraft] = useState<{ url: string; text: string; needsText: boolean } | null>(null);
  const [mention, setMention] = useState<MentionState | null>(null);
  const [suggestions, setSuggestions] = useState<NetworkMember[]>([]);
  const [activeSuggestion, setActiveSuggestion] = useState(0);

  const refreshEmpty = useCallback(() => {
    const el = editorRef.current;
    if (!el) return;
    setEmpty(!el.textContent?.trim() && !el.querySelector("ul,ol,pre,blockquote,table,h1,h2,h3,h4,.mention-chip"));
  }, []);

  useLayoutEffect(() => {
    const el = editorRef.current;
    if (!el || value === syncedValue.current) return;
    el.innerHTML = markdownToHtml(value);
    syncedValue.current = value;
    refreshEmpty();
  }, [value, refreshEmpty]);

  useEffect(() => {
    if (!autoFocus) return;
    const el = editorRef.current;
    if (!el) return;
    el.focus();
    const range = document.createRange();
    range.selectNodeContents(el);
    range.collapse(false);
    window.getSelection()?.removeAllRanges();
    window.getSelection()?.addRange(range);
    // Only on mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const closestInEditor = useCallback((node: Node | null, selector: string): HTMLElement | null => {
    const el = node instanceof Element ? node : node?.parentElement;
    const found = el?.closest<HTMLElement>(selector);
    return found && editorRef.current?.contains(found) && found !== editorRef.current ? found : null;
  }, []);

  const refreshActive = useCallback(() => {
    const sel = window.getSelection();
    const el = editorRef.current;
    if (!el || !sel?.rangeCount || !el.contains(sel.anchorNode)) return;
    const next: Partial<Record<ToolId, boolean>> = {};
    for (const [id, cmd] of Object.entries(COMMAND)) {
      if (id === "ul" || id === "ol") continue;
      try {
        next[id as ToolId] = document.queryCommandState(cmd);
      } catch {
        next[id as ToolId] = false;
      }
    }
    for (const [id, selector] of Object.entries(BLOCK_SELECTOR)) {
      next[id as ToolId] = !!closestInEditor(sel.anchorNode, selector);
    }
    // Headings render bold, which isn't the same as the Bold tool being on.
    if (next.heading) next.bold = !!closestInEditor(sel.anchorNode, "b,strong");
    setActive(next);
  }, [closestInEditor]);

  useEffect(() => {
    document.addEventListener("selectionchange", refreshActive);
    return () => document.removeEventListener("selectionchange", refreshActive);
  }, [refreshActive]);

  // @mention suggestions, same search the plain textarea uses.
  useEffect(() => {
    if (!mention) return;
    let cancelled = false;
    const timer = setTimeout(async () => {
      const results = await searchMentionCandidatesAction(mention.query);
      if (!cancelled) {
        setSuggestions(results);
        setActiveSuggestion(0);
      }
    }, 150);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [mention]);

  function emit() {
    const el = editorRef.current;
    if (!el) return;
    const markdown = domToMarkdown(el);
    syncedValue.current = markdown;
    refreshEmpty();
    onChange(markdown);
  }

  function detectMention() {
    const sel = window.getSelection();
    const node = sel?.anchorNode;
    if (!sel?.isCollapsed || !(node instanceof Text) || closestInEditor(node, "pre,code")) return setMention(null);
    const before = node.data.slice(0, sel.anchorOffset);
    const match = /(?:^|\s)@([^\s@]{0,40})$/.exec(before);
    if (!match) return setMention(null);
    setMention({ node, start: sel.anchorOffset - match[1].length - 1, query: match[1] });
  }

  function selectSuggestion(member: NetworkMember) {
    const sel = window.getSelection();
    if (!mention || !sel?.rangeCount) return;
    const range = document.createRange();
    const end = sel.anchorNode === mention.node ? sel.anchorOffset : mention.start + mention.query.length + 1;
    range.setStart(mention.node, mention.start);
    range.setEnd(mention.node, Math.min(end, mention.node.length));
    range.deleteContents();
    const holder = document.createElement("span");
    holder.innerHTML = mentionChipHtml(member.name, member.id);
    const chip = holder.firstChild!;
    const space = document.createTextNode(" ");
    range.insertNode(space);
    range.insertNode(chip);
    placeCaret(space, 1);
    setMention(null);
    setSuggestions([]);
    emit();
  }

  function saveSelection() {
    const sel = window.getSelection();
    if (sel?.rangeCount && editorRef.current?.contains(sel.anchorNode)) savedRange.current = sel.getRangeAt(0).cloneRange();
  }

  function restoreSelection() {
    const el = editorRef.current;
    if (!el) return;
    el.focus();
    const range = savedRange.current;
    if (range && el.contains(range.startContainer)) {
      window.getSelection()?.removeAllRanges();
      window.getSelection()?.addRange(range);
    }
  }

  function wrapInline(create: () => HTMLElement, placeholderText: string, textOnly = false) {
    const sel = window.getSelection();
    if (!sel?.rangeCount) return;
    const range = sel.getRangeAt(0);
    const el = create();
    if (range.collapsed) {
      el.textContent = placeholderText;
    } else {
      const contents = range.extractContents();
      if (textOnly) el.textContent = contents.textContent;
      else el.appendChild(contents);
    }
    range.insertNode(el);
    const select = document.createRange();
    select.selectNodeContents(el);
    sel.removeAllRanges();
    sel.addRange(select);
  }

  function toggleBlock(tag: "H3" | "BLOCKQUOTE" | "PRE", selector: string) {
    const sel = window.getSelection();
    const existing = closestInEditor(sel?.anchorNode ?? null, selector);
    if (existing) {
      const target = /^H\d$/.test(existing.tagName) ? toParagraph(existing) : unwrapBlock(existing);
      if (target) placeCaret(target, 0);
    } else {
      const el = editorRef.current!;
      const pos = getTextSelection(el);
      document.execCommand("formatBlock", false, `<${tag.toLowerCase()}>`);
      if (pos) setTextSelection(el, pos);
    }
  }

  function applyTool(id: ToolId) {
    const el = editorRef.current;
    if (!el || disabled) return;
    el.focus();
    if (!el.contains(window.getSelection()?.anchorNode ?? null)) {
      placeCaret(el, el.childNodes.length);
    }
    const sel = window.getSelection();
    const anchor = sel?.anchorNode ?? null;

    if (id === "ul" || id === "ol") {
      const pos = getTextSelection(el);
      document.execCommand(COMMAND[id]!, false);
      if (pos) setTextSelection(el, pos);
    } else if (COMMAND[id]) {
      document.execCommand(COMMAND[id]!, false);
    } else if (id === "heading") {
      toggleBlock("H3", BLOCK_SELECTOR.heading!);
    } else if (id === "quote") {
      toggleBlock("BLOCKQUOTE", "blockquote");
    } else if (id === "codeblock") {
      toggleBlock("PRE", "pre");
    } else if (id === "spoiler" || id === "code") {
      const existing = closestInEditor(anchor, BLOCK_SELECTOR[id]!);
      if (existing) unwrapInline(existing);
      else if (id === "spoiler")
        wrapInline(() => Object.assign(document.createElement("span"), { className: "rt-spoiler" }), "spoiler");
      else wrapInline(() => document.createElement("code"), "code", true);
    } else if (id === "link") {
      const existing = closestInEditor(anchor, "a");
      if (existing) {
        unwrapInline(existing);
      } else {
        saveSelection();
        setLinkDraft({ url: "", text: "", needsText: !!sel?.isCollapsed });
        return;
      }
    } else if (id === "table") {
      document.execCommand(
        "insertHTML",
        false,
        "<table><thead><tr><th>Column 1</th><th>Column 2</th></tr></thead><tbody><tr><td>Cell</td><td>Cell</td></tr></tbody></table><p><br></p>",
      );
    }
    emit();
    refreshActive();
  }

  function applyLink() {
    if (!linkDraft) return;
    let url = linkDraft.url.trim();
    if (url && !/^https?:\/\//i.test(url)) url = `https://${url}`;
    const valid = /^https?:\/\/[^\s)]+\.[^\s)]+$/i.test(url);
    restoreSelection();
    if (valid) {
      if (linkDraft.needsText) {
        const text = linkDraft.text.trim() || url;
        const a = document.createElement("a");
        a.href = url;
        a.textContent = text;
        document.execCommand("insertHTML", false, a.outerHTML + "&nbsp;");
      } else {
        document.execCommand("createLink", false, url);
      }
      emit();
    }
    setLinkDraft(null);
  }

  // Enter on an empty last line leaves a quote or code block, like Reddit.
  function exitBlockOnEnter(e: React.KeyboardEvent<HTMLDivElement>) {
    const sel = window.getSelection();
    if (!sel?.isCollapsed || !sel.rangeCount) return false;
    const pre = closestInEditor(sel.anchorNode, "pre");
    const quote = closestInEditor(sel.anchorNode, "blockquote");
    const container = pre ?? quote;
    if (!container) return false;

    const rest = document.createRange();
    rest.setStart(sel.anchorNode!, sel.anchorOffset);
    rest.setEndAfter(container.lastChild ?? container);
    if (rest.toString().replace(/\n/g, "").length) return false;

    if (pre) {
      const text = pre.innerText;
      if (!text.endsWith("\n") || text === "\n") return false;
      pre.textContent = text.replace(/\n+$/, "");
    } else {
      const line = closestInEditor(sel.anchorNode, "p,div");
      const lineInQuote = line && quote!.contains(line) ? line : null;
      if (lineInQuote ? lineInQuote.textContent?.trim() : sel.anchorNode?.textContent?.trim()) return false;
      lineInQuote?.remove();
    }
    e.preventDefault();
    const p = document.createElement("p");
    p.appendChild(document.createElement("br"));
    container.after(p);
    placeCaret(p, 0);
    emit();
    return true;
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLDivElement>) {
    if (mention && suggestions.length) {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        return setActiveSuggestion((i) => (i + 1) % suggestions.length);
      }
      if (e.key === "ArrowUp") {
        e.preventDefault();
        return setActiveSuggestion((i) => (i - 1 + suggestions.length) % suggestions.length);
      }
      if (e.key === "Enter" || e.key === "Tab") {
        e.preventDefault();
        return selectSuggestion(suggestions[activeSuggestion]);
      }
      if (e.key === "Escape") return setMention(null);
    }
    if (e.key === "Enter" && !e.shiftKey && exitBlockOnEnter(e)) return;
    const mod = e.ctrlKey || e.metaKey;
    if (mod && e.key.toLowerCase() === "k") {
      e.preventDefault();
      applyTool("link");
    } else if (mod && e.key.toLowerCase() === "u") {
      e.preventDefault(); // underline has no Markdown equivalent
    }
  }

  function handlePaste(e: React.ClipboardEvent<HTMLDivElement>) {
    // Pasted HTML would bring arbitrary styling; keep just the text.
    e.preventDefault();
    document.execCommand("insertText", false, e.clipboardData.getData("text/plain"));
  }

  const toolButtons = TOOLS.map((tool) => (
    <span key={tool.id} style={{ display: "contents" }}>
      <button
        type="button"
        className={`rte-tool${active[tool.id] ? " is-active" : ""}`}
        title={tool.label}
        aria-label={tool.label}
        aria-pressed={!!active[tool.id]}
        disabled={disabled}
        onMouseDown={(e) => e.preventDefault()}
        onClick={() => applyTool(tool.id)}
      >
        <tool.icon size={16} />
      </button>
      {tool.divider && <span className="rte-divider" aria-hidden="true" />}
    </span>
  ));

  const toolbar = toolbarOpen && (
    <div className="rte-toolbar" role="toolbar" aria-label="Formatting">
      {hideToolbarToggle && footerStart}
      {hideToolbarToggle && footerStart && <span className="rte-divider" aria-hidden="true" />}
      {toolButtons}
    </div>
  );

  return (
    <div className={`rte${disabled ? " is-disabled" : ""}`}>
      <div style={{ position: "relative" }}>
        <div
            ref={editorRef}
            className="rte-input rich-text"
            contentEditable={!disabled}
            suppressContentEditableWarning
            role="textbox"
            aria-multiline="true"
            aria-label={placeholder}
            aria-disabled={disabled}
            data-placeholder={placeholder}
            data-empty={empty ? "true" : undefined}
            style={{ minHeight }}
            onFocus={() => {
              document.execCommand("defaultParagraphSeparator", false, "p");
              document.execCommand("styleWithCSS", false, "false");
            }}
            onInput={() => {
              emit();
              detectMention();
            }}
            onKeyDown={handleKeyDown}
            onKeyUp={(e) => {
              if (e.key.startsWith("Arrow") || e.key === "Home" || e.key === "End") detectMention();
            }}
            onClick={detectMention}
            onBlur={() => setTimeout(() => setMention(null), 150)}
            onPaste={handlePaste}
          />
        {mention && suggestions.length > 0 && (
          <div className="mention-suggestions">
            {suggestions.map((m, i) => (
              <button
                type="button"
                key={m.id}
                className={`mention-suggestion${i === activeSuggestion ? " active" : ""}`}
                onMouseDown={(e) => {
                  e.preventDefault();
                  selectSuggestion(m);
                }}
              >
                <Avatar name={m.name} avatarUrl={m.avatarUrl} size={28} />
                <span className="mention-suggestion-info">
                  <strong>{m.name}</strong>
                  {(m.headline || m.jobTitle) && <span className="meta">{m.headline || m.jobTitle}</span>}
                </span>
              </button>
            ))}
          </div>
        )}
      </div>

      {linkDraft && (
        <div className="rte-link-bar">
          {linkDraft.needsText && (
            <input
              className="rte-link-input"
              placeholder="Text"
              value={linkDraft.text}
              onChange={(e) => setLinkDraft({ ...linkDraft, text: e.target.value })}
            />
          )}
          <input
            className="rte-link-input"
            placeholder="https://"
            autoFocus
            value={linkDraft.url}
            onChange={(e) => setLinkDraft({ ...linkDraft, url: e.target.value })}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                applyLink();
              } else if (e.key === "Escape") {
                setLinkDraft(null);
                restoreSelection();
              }
            }}
          />
          <button type="button" className="comment-btn is-secondary" onClick={() => setLinkDraft(null)}>
            Cancel
          </button>
          <button type="button" className="comment-btn" onClick={applyLink}>
            Save
          </button>
        </div>
      )}

      {hideToolbarToggle ? (
        <>
          {toolbar || (footerStart && <div className="rte-footer">{footerStart}</div>)}
          {footerEnd && (
            <div className="rte-footer">
              <span style={{ flex: 1 }} />
              {footerEnd}
            </div>
          )}
        </>
      ) : (
        <>
          {toolbar}
          <div className="rte-footer">
            {footerStart}
            <button
              type="button"
              className={`rte-tool${toolbarOpen ? " is-active" : ""}`}
              title={toolbarOpen ? "Hide formatting" : "Show formatting"}
              aria-label={toolbarOpen ? "Hide formatting" : "Show formatting"}
              aria-pressed={toolbarOpen}
              onClick={() => setToolbarOpen((o) => !o)}
            >
              <CaseSensitive size={18} />
            </button>
            <span style={{ flex: 1 }} />
            {footerEnd}
          </div>
        </>
      )}
    </div>
  );
}
