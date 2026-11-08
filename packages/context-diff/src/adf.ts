import type { AdfDoc, AdfNode, Section } from "./types.js";

const BLOCK_TYPES = new Set([
  "paragraph",
  "heading",
  "bulletList",
  "orderedList",
  "listItem",
  "blockquote",
  "codeBlock",
  "panel",
  "table",
  "tableRow",
  "tableHeader",
  "tableCell",
  "expand",
  "nestedExpand",
  "rule",
  "mediaSingle",
  "mediaGroup",
  "decisionList",
  "decisionItem",
  "taskList",
  "taskItem",
]);

/** Node types patchSection can rewrite without losing structure. */
const SIMPLE_BODY_TYPES = new Set(["paragraph", "bulletList", "orderedList", "rule"]);

/** Plain text of an ADF node. Block nodes are separated by newlines. */
export function extractText(node: AdfNode): string {
  switch (node.type) {
    case "text":
      return node.text ?? "";
    case "hardBreak":
      return "\n";
    case "mention":
    case "status":
      return String(node.attrs?.text ?? "");
    case "emoji":
      return String(node.attrs?.text ?? node.attrs?.shortName ?? "");
    case "inlineCard":
    case "blockCard":
      return String(node.attrs?.url ?? "");
    case "date": {
      const ts = Number(node.attrs?.timestamp);
      return Number.isFinite(ts) ? new Date(ts).toISOString().slice(0, 10) : "";
    }
  }
  const children = node.content ?? [];
  const parts = children.map(extractText);
  const isBlockContainer = children.some((c) => BLOCK_TYPES.has(c.type));
  return parts.join(isBlockContainer ? "\n" : "").replace(/\n{3,}/g, "\n\n");
}

export function slugify(text: string): string {
  const slug = text
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return slug || "section";
}

export interface SplitOptions {
  /** Headings at or above this level start a new section. Default 3. */
  maxLevel?: number;
}

/**
 * Split a document into heading-delimited sections.
 * Content before the first heading becomes the "_intro" section.
 * Ids are stable as long as heading text doesn't change; duplicates get "-2", "-3"...
 */
export function splitSections(doc: AdfDoc, opts: SplitOptions = {}): Section[] {
  const maxLevel = opts.maxLevel ?? 3;
  const nodes = doc.content ?? [];
  const sections: Section[] = [];
  const seen = new Map<string, number>();

  let start = 0;
  let heading: AdfNode | null = null;

  const flush = (end: number) => {
    const bodyStart = heading ? start + 1 : start;
    const body = nodes.slice(bodyStart, end);
    if (!heading && body.length === 0) return;
    const headingText = heading ? extractText(heading).trim() : null;
    const base = headingText === null ? "_intro" : slugify(headingText);
    const n = (seen.get(base) ?? 0) + 1;
    seen.set(base, n);
    sections.push({
      id: n === 1 ? base : `${base}-${n}`,
      heading: headingText,
      level: heading ? Number(heading.attrs?.level ?? 1) : 0,
      text: body.map(extractText).join("\n").trim(),
      range: [start, end],
      complex: body.some((b) => !SIMPLE_BODY_TYPES.has(b.type)),
    });
  };

  nodes.forEach((node, i) => {
    const level = Number(node.attrs?.level ?? 99);
    if (node.type === "heading" && level <= maxLevel) {
      flush(i);
      start = i;
      heading = node;
    }
  });
  flush(nodes.length);
  return sections;
}

/**
 * Convert plain text to ADF block nodes.
 * Blank lines separate paragraphs; consecutive "- " / "* " lines become a bullet list,
 * "1. " lines an ordered list.
 */
export function textToAdf(text: string): AdfNode[] {
  const blocks: AdfNode[] = [];
  const paragraph = (s: string): AdfNode => ({
    type: "paragraph",
    content: s ? [{ type: "text", text: s }] : [],
  });

  for (const chunk of text.replace(/\r\n/g, "\n").split(/\n\s*\n/)) {
    const lines = chunk.split("\n").filter((l) => l.trim() !== "");
    let list: { type: string; items: string[] } | null = null;
    let para: string[] = [];

    const flushPara = () => {
      if (para.length) blocks.push(paragraph(para.join(" ")));
      para = [];
    };
    const flushList = () => {
      if (list) {
        blocks.push({
          type: list.type,
          content: list.items.map((t) => ({ type: "listItem", content: [paragraph(t)] })),
        });
      }
      list = null;
    };

    for (const raw of lines) {
      const line = raw.trim();
      const bullet = /^[-*]\s+(.*)$/.exec(line);
      const ordered = /^\d+[.)]\s+(.*)$/.exec(line);
      const match = bullet ?? ordered;
      if (match) {
        flushPara();
        const type = bullet ? "bulletList" : "orderedList";
        if (list && list.type !== type) flushList();
        list ??= { type, items: [] };
        list.items.push(match[1] ?? "");
      } else {
        flushList();
        para.push(line);
      }
    }
    flushPara();
    flushList();
  }
  return blocks;
}

/**
 * Return a new document with the body of `sectionId` replaced by `newText`.
 * The heading is kept. Throws if the section doesn't exist.
 * Check `section.complex` first: complex bodies (tables, panels...) are flattened to text.
 */
export function patchSection(
  doc: AdfDoc,
  sectionId: string,
  newText: string,
  opts: SplitOptions = {},
): AdfDoc {
  const section = splitSections(doc, opts).find((s) => s.id === sectionId);
  if (!section) throw new Error(`Section not found: ${sectionId}`);
  const [start, end] = section.range;
  const bodyStart = section.heading === null ? start : start + 1;
  const content = [
    ...doc.content.slice(0, bodyStart),
    ...textToAdf(newText),
    ...doc.content.slice(end),
  ];
  return { ...doc, content };
}
