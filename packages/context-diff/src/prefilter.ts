import type { ChangeFact, Section } from "./types.js";

const STOPWORDS = new Set(
  "the and for with that this from have will should would could into when then than they them their there these those been being about after before also only must shall each other some such very what which while your yours just more most over under".split(
    " ",
  ),
);

const KEY_PATTERN = /\b[A-Z][A-Z0-9]+-\d+\b/g;

function tokens(text: string): string[] {
  return (text.toLowerCase().match(/[a-z0-9][a-z0-9_.-]*/g) ?? [])
    .map((t) => t.replace(/[._-]+$/, ""))
    .filter(
    (t) => (t.length >= 4 || /\d/.test(t)) && !STOPWORDS.has(t),
  );
}

export interface ScoredSection {
  section: Section;
  score: number;
  /** Terms that matched, for explaining why a section was picked. */
  hits: string[];
}

export interface PrefilterOptions {
  /** Minimum score to keep a section. Default 2. */
  minScore?: number;
  /** Max sections returned. Default 8. */
  limit?: number;
}

/**
 * Cheap relevance filter before calling an LLM.
 * Weights: issue keys ×3, terms that were added/removed by the change ×2, other terms ×1.
 * Sections that mention the change's issue key are always kept.
 */
export function prefilter(
  facts: ChangeFact[],
  sections: Section[],
  opts: PrefilterOptions = {},
): ScoredSection[] {
  const minScore = opts.minScore ?? 2;
  const limit = opts.limit ?? 8;

  const weights = new Map<string, number>();
  const bump = (term: string, w: number) => weights.set(term, Math.max(weights.get(term) ?? 0, w));

  const keys = new Set<string>();
  for (const f of facts) {
    const sourceKey = f.source.split(":").pop();
    if (sourceKey && /^[A-Z][A-Z0-9]+-\d+$/.test(sourceKey)) keys.add(sourceKey.toLowerCase());
    for (const text of [f.from, f.to]) for (const k of text?.match(KEY_PATTERN) ?? []) keys.add(k.toLowerCase());

    const fromT = new Set(tokens(f.from ?? ""));
    const toT = new Set(tokens(f.to ?? ""));
    for (const t of fromT) bump(t, toT.has(t) ? 1 : 2);
    for (const t of toT) bump(t, fromT.has(t) ? 1 : 2);
    for (const t of tokens(f.field)) bump(t, 1);
  }
  for (const k of keys) bump(k, 3);

  const scored = sections.map((section): ScoredSection => {
    const present = new Set(tokens(`${section.heading ?? ""}\n${section.text}`));
    const hits = [...weights.keys()].filter((t) => present.has(t));
    const score = hits.reduce((sum, t) => sum + (weights.get(t) ?? 0), 0);
    return { section, score, hits };
  });

  return scored
    .filter((s) => s.score >= minScore || s.hits.some((h) => keys.has(h)))
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
}
