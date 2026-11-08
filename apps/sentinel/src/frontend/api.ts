import { invoke } from "@forge/bridge";
import type { PageCheck } from "../types";

type Result = { ok: boolean; reason?: string };

interface Api {
  getPageFindings: { in: void; out: { checks: PageCheck[]; error?: string } };
  getIssueDocs: { in: void; out: { checks: PageCheck[]; error?: string } };
  applyFix: { in: { pageId: string; issueKey: string; sectionId: string; text?: string }; out: Result };
  dismiss: { in: { pageId: string; issueKey: string; sectionId: string }; out: Result };
}

/** Typed wrapper around invoke. Without the metadata option, invoke resolves to the resolver's return value. */
export function call<K extends keyof Api>(fn: K, payload?: Api[K]["in"]): Promise<Api[K]["out"]> {
  return invoke(fn, payload ?? {}) as Promise<Api[K]["out"]>;
}
