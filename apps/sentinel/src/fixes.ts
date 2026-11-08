import api from "@forge/api";
import { patchSection, splitSections } from "context-diff";
import { getPage, updatePage } from "./confluence";
import { hash } from "./hash";
import { getPageCheck, removeFinding } from "./store";

export interface FixRequest {
  pageId: string;
  issueKey: string;
  sectionId: string;
  /** Replacement text. Defaults to the stored suggestion. */
  text?: string;
}
export type FixResult = { ok: true; page: string; section: string } | { ok: false; reason: string };

/**
 * Apply a suggested fix as the current user. Used by the byline popup and the Rovo agent.
 * Refuses if the section changed since the check, so a stale suggestion never overwrites newer edits.
 */
export async function applyFinding({ pageId, issueKey, sectionId, text }: FixRequest): Promise<FixResult> {
  const as = api.asUser();
  const check = await getPageCheck(pageId, issueKey, as);
  const finding = check?.findings.find((f) => f.sectionId === sectionId);
  if (!check || !finding) return { ok: false, reason: "That finding no longer exists. It may have been applied or dismissed already." };

  const page = await getPage(pageId, as);
  const current = splitSections(page.doc).find((s) => s.id === sectionId);
  if (!current || hash(current.text) !== finding.textHash) {
    return { ok: false, reason: "This section was edited since the check. Re-run the check first." };
  }
  const replacement = text?.trim() ? text : finding.suggestedText;
  if (!replacement) return { ok: false, reason: "There is no suggested text for this section." };

  const section = finding.heading ?? "intro";
  await updatePage(page, patchSection(page.doc, sectionId, replacement), `Sentinel: updated "${section}" after ${issueKey}`, as);
  await removeFinding(pageId, issueKey, sectionId, as);
  return { ok: true, page: page.title, section };
}

export async function dismissFinding({ pageId, issueKey, sectionId }: FixRequest): Promise<FixResult> {
  const as = api.asUser();
  const finding = (await getPageCheck(pageId, issueKey, as))?.findings.find((f) => f.sectionId === sectionId);
  if (!finding) return { ok: false, reason: "That finding no longer exists." };
  await removeFinding(pageId, issueKey, sectionId, as);
  return { ok: true, page: pageId, section: finding.heading ?? "intro" };
}
