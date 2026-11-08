import { FINDINGS_JSON_SCHEMA, type PromptBuilder } from "context-diff";

/** Sentinel's private prompt. Kept out of the OSS library on purpose. */
export const buildPrompt: PromptBuilder = (facts, sections) => {
  const changes = facts
    .map((f) => `- [${f.source}] ${f.field}: ${quote(f.from) ?? "(empty)"} → ${quote(f.to) ?? "(empty)"}`)
    .join("\n");
  const docs = sections
    .map((s) => `<section id="${s.id}" heading="${s.heading ?? "(intro)"}">\n${s.text}\n</section>`)
    .join("\n\n");

  return `You keep team documentation accurate. A Jira issue just changed. Decide, for each documentation section below, whether the change makes it outdated.

## What changed
${changes}

## Documentation sections
${docs}

## Rules
- The NEW value ("→" side) is the truth now. The old value only tells you what changed.
- "outdated": the section explicitly states something that is false under the NEW value. Quote that statement in evidence.
- "ok": the section agrees with the NEW value, is unrelated, or is only general/introductory. A section that merely lacks detail is "ok".
- "uncertain": it may contradict the NEW value but the wording is ambiguous.
- Only judge against the change above, not general knowledge or best practice.
- For "outdated", write suggestedText: the full replacement body for that section, same tone and format, minimal edits. Plain text; use "- " for bullet items and blank lines between paragraphs.
- evidence: short quotes from the change and the section that support your verdict.
- confidence: 0..1.
- Return one entry per section id listed above.

Reply with JSON only, matching this schema:
${JSON.stringify(FINDINGS_JSON_SCHEMA)}`;
};

function quote(v: string | null | undefined): string | undefined {
  if (v === null || v === undefined) return undefined;
  const short = v.length > 1500 ? `${v.slice(0, 1500)}…` : v;
  return `"${short}"`;
}
