import type { ChangeFact, Finding } from "context-diff";

/** Job pushed by the trigger, consumed by the check worker. */
export interface CheckJob extends Record<string, unknown> {
  issueKey: string;
  parentKey?: string;
  facts: ChangeFact[];
}

/** A finding plus what's needed to apply it safely later. */
export interface StoredFinding extends Finding {
  heading: string | null;
  currentText: string;
  /** Hash of the section text the finding was computed against. */
  textHash: string;
  complex: boolean;
}

/** Findings for one page caused by one issue. KVS key: f:{pageId}:{issueKey} */
export interface PageCheck {
  pageId: string;
  pageTitle: string;
  pageUrl?: string;
  pageVersion: number;
  issueKey: string;
  checkedAt: string;
  findings: StoredFinding[];
}

/** Pages checked for an issue. KVS key: i:{issueKey} */
export interface IssueIndex {
  issueKey: string;
  pageIds: string[];
  updatedAt: string;
}
