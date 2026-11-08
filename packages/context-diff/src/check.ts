import type { ChangeFact, Finding, FindingStatus, LlmAdapter, Section } from "./types.js";

/** JSON shape the LLM must return. Include it in your prompt. */
export const FINDINGS_JSON_SCHEMA = {
  type: "object",
  required: ["findings"],
  properties: {
    findings: {
      type: "array",
      items: {
        type: "object",
        required: ["sectionId", "status", "reason", "confidence"],
        properties: {
          sectionId: { type: "string" },
          status: { enum: ["outdated", "ok", "uncertain"] },
          reason: { type: "string" },
          evidence: { type: "array", items: { type: "string" } },
          suggestedText: { type: "string" },
          confidence: { type: "number", minimum: 0, maximum: 1 },
        },
      },
    },
  },
} as const;

export type PromptBuilder = (facts: ChangeFact[], sections: Section[]) => string;

export interface CheckOptions {
  facts: ChangeFact[];
  sections: Section[];
  llm: LlmAdapter;
  /** You own the prompt. Ask for JSON matching FINDINGS_JSON_SCHEMA. */
  buildPrompt: PromptBuilder;
  /** Sections per LLM call. Default 4. */
  batchSize?: number;
  /** Parallel LLM calls. Default 2. */
  concurrency?: number;
}

export interface CheckResult {
  findings: Finding[];
  /** Batches whose call or parse failed. */
  failures: Array<{ sectionIds: string[]; error: unknown }>;
}

/** Check sections against change facts with an LLM, in batches. One bad batch doesn't fail the rest. */
export async function checkClaims(opts: CheckOptions): Promise<CheckResult> {
  const { facts, sections, llm, buildPrompt } = opts;
  const batchSize = Math.max(1, opts.batchSize ?? 4);
  const concurrency = Math.max(1, opts.concurrency ?? 2);

  const batches: Section[][] = [];
  for (let i = 0; i < sections.length; i += batchSize) batches.push(sections.slice(i, i + batchSize));

  const findings: Finding[] = [];
  const failures: CheckResult["failures"] = [];

  let next = 0;
  const worker = async () => {
    while (next < batches.length) {
      const batch = batches[next++]!;
      const ids = batch.map((s) => s.id);
      try {
        const raw = await llm.complete(buildPrompt(facts, batch));
        findings.push(...parseFindings(raw, ids));
      } catch (error) {
        failures.push({ sectionIds: ids, error });
      }
    }
  };
  await Promise.all(Array.from({ length: Math.min(concurrency, batches.length) }, worker));

  const order = new Map(sections.map((s, i) => [s.id, i]));
  findings.sort((a, b) => (order.get(a.sectionId) ?? 0) - (order.get(b.sectionId) ?? 0));
  return { findings, failures };
}

const STATUSES: ReadonlySet<string> = new Set<FindingStatus>(["outdated", "ok", "uncertain"]);

/**
 * Parse LLM output into findings. Tolerates code fences and surrounding prose.
 * Drops entries for unknown section ids. Throws if no JSON can be found.
 */
export function parseFindings(raw: string, validSectionIds?: string[]): Finding[] {
  const json = extractJson(raw);
  const list: unknown[] = Array.isArray(json)
    ? json
    : Array.isArray((json as { findings?: unknown })?.findings)
      ? (json as { findings: unknown[] }).findings
      : [];
  const valid = validSectionIds ? new Set(validSectionIds) : null;

  return list.flatMap((item): Finding[] => {
    if (typeof item !== "object" || item === null) return [];
    const o = item as Record<string, unknown>;
    const sectionId = typeof o.sectionId === "string" ? o.sectionId : null;
    if (!sectionId || (valid && !valid.has(sectionId))) return [];
    const status = typeof o.status === "string" && STATUSES.has(o.status) ? (o.status as FindingStatus) : "uncertain";
    const confidence = Number(o.confidence);
    const finding: Finding = {
      sectionId,
      status,
      reason: typeof o.reason === "string" ? o.reason : "",
      evidence: Array.isArray(o.evidence) ? o.evidence.filter((e): e is string => typeof e === "string") : [],
      confidence: Number.isFinite(confidence) ? Math.min(1, Math.max(0, confidence)) : 0.5,
    };
    if (typeof o.suggestedText === "string" && o.suggestedText.trim()) finding.suggestedText = o.suggestedText;
    return [finding];
  });
}

function extractJson(raw: string): unknown {
  const fenced = /```(?:json)?\s*([\s\S]*?)```/i.exec(raw);
  const candidate = (fenced?.[1] ?? raw).trim();
  try {
    return JSON.parse(candidate);
  } catch {
    const start = candidate.search(/[[{]/);
    const end = Math.max(candidate.lastIndexOf("}"), candidate.lastIndexOf("]"));
    if (start === -1 || end <= start) throw new Error("No JSON found in LLM output");
    return JSON.parse(candidate.slice(start, end + 1));
  }
}

/** Findings worth showing to users: outdated (and optionally uncertain) above a confidence bar. */
export function actionable(
  findings: Finding[],
  opts: { minConfidence?: number; includeUncertain?: boolean } = {},
): Finding[] {
  const min = opts.minConfidence ?? 0.6;
  return findings.filter(
    (f) => f.confidence >= min && (f.status === "outdated" || (opts.includeUncertain && f.status === "uncertain")),
  );
}
