"use client";

import Link from "next/link";
import { useState } from "react";
import { parseBlocks, type Block, type Inline } from "@/lib/rich-text";

function Spoiler({ children }: { children: React.ReactNode }) {
  const [revealed, setRevealed] = useState(false);
  return (
    <span
      className={`rt-spoiler${revealed ? " is-revealed" : ""}`}
      role="button"
      tabIndex={0}
      title={revealed ? undefined : "Reveal spoiler"}
      onClick={(e) => {
        e.stopPropagation();
        setRevealed(true);
      }}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") setRevealed(true);
      }}
    >
      {children}
    </span>
  );
}

function renderInline(nodes: Inline[]): React.ReactNode[] {
  return nodes.map((n, i) => {
    switch (n.t) {
      case "text":
        return n.v;
      case "mention":
        return (
          <Link key={i} href={`/network/${n.id}`} className="mention-link" onClick={(e) => e.stopPropagation()}>
            @{n.name}
          </Link>
        );
      case "code":
        return <code key={i} className="rt-code">{n.v}</code>;
      case "link":
        return (
          <a key={i} href={n.href} target="_blank" rel="noopener noreferrer nofollow" onClick={(e) => e.stopPropagation()}>
            {renderInline(n.children)}
          </a>
        );
      case "b":
        return <strong key={i}>{renderInline(n.children)}</strong>;
      case "i":
        return <em key={i}>{renderInline(n.children)}</em>;
      case "s":
        return <s key={i}>{renderInline(n.children)}</s>;
      case "sup":
        return <sup key={i}>{renderInline(n.children)}</sup>;
      case "spoiler":
        return <Spoiler key={i}>{renderInline(n.children)}</Spoiler>;
    }
  });
}

function renderBlocks(blocks: Block[]): React.ReactNode[] {
  return blocks.map((b, i) => {
    switch (b.t) {
      case "p":
        return (
          <p key={i}>
            {b.lines.map((line, j) => (
              <span key={j}>
                {j > 0 && <br />}
                {renderInline(line)}
              </span>
            ))}
          </p>
        );
      case "h": {
        const Tag = (["h3", "h4", "h5"] as const)[b.level - 1];
        return <Tag key={i}>{renderInline(b.children)}</Tag>;
      }
      case "quote":
        return <blockquote key={i}>{renderBlocks(b.blocks)}</blockquote>;
      case "ul":
      case "ol": {
        const Tag = b.t;
        return (
          <Tag key={i}>
            {b.items.map((item, j) => (
              <li key={j}>{renderInline(item)}</li>
            ))}
          </Tag>
        );
      }
      case "pre":
        return (
          <pre key={i} className="rt-pre">
            <code>{b.v}</code>
          </pre>
        );
      case "table":
        return (
          <div key={i} className="rt-table-wrap">
            <table>
              <thead>
                <tr>
                  {b.head.map((cell, j) => (
                    <th key={j}>{renderInline(cell)}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {b.rows.map((row, r) => (
                  <tr key={r}>
                    {row.map((cell, j) => (
                      <td key={j}>{renderInline(cell)}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        );
    }
  });
}

// Renders a community post/comment body (see lib/rich-text.ts). Block-level
// output, so it must sit in a <div>, never inside a <p>.
export function RichText({ text, className }: { text: string; className?: string }) {
  return <div className={`rich-text${className ? ` ${className}` : ""}`}>{renderBlocks(parseBlocks(text))}</div>;
}
