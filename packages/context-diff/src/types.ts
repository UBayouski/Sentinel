/** A single fact about something that changed, e.g. a Jira field edit. */
export interface ChangeFact {
  /** Where the change came from, e.g. "jira:PAY-12". */
  source: string;
  /** Human-readable field name, e.g. "Acceptance criteria". */
  field: string;
  from?: string | null;
  to?: string | null;
  /** ISO timestamp of the change. */
  at?: string;
  url?: string;
}

/** A piece of content (page, doc, record) that may be affected by a change. */
export interface ContentRef {
  id: string;
  /** Free-form kind, e.g. "confluence:page". */
  kind: string;
  title?: string;
  url?: string;
  /** Names of the resolvers that found this ref, best first. */
  via: string[];
  /** Lower is better (resolver priority). */
  rank: number;
}

/** A heading-delimited part of a document. */
export interface Section {
  /** Stable id derived from the heading text, e.g. "retry-policy" or "_intro". */
  id: string;
  heading: string | null;
  level: number;
  /** Plain text of the section body (heading excluded). */
  text: string;
  /** Top-level node range in the document: [start, end). Includes the heading node. */
  range: [number, number];
  /** True if the body contains nodes that patchSection would flatten (tables, panels, code, media...). */
  complex: boolean;
}

export type FindingStatus = "outdated" | "ok" | "uncertain";

export interface Finding {
  sectionId: string;
  status: FindingStatus;
  reason: string;
  evidence: string[];
  suggestedText?: string;
  /** 0..1 */
  confidence: number;
}

/** Minimal LLM interface. Bring your own provider. */
export interface LlmAdapter {
  complete(prompt: string): Promise<string>;
}

/** Minimal ADF (Atlassian Document Format) node shape. */
export interface AdfNode {
  type: string;
  text?: string;
  attrs?: Record<string, unknown>;
  marks?: Array<{ type: string; attrs?: Record<string, unknown> }>;
  content?: AdfNode[];
}

export interface AdfDoc extends AdfNode {
  type: "doc";
  version?: number;
  content: AdfNode[];
}
