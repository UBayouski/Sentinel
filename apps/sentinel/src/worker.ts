import api from "@forge/api";
import type { AsyncEvent } from "@forge/events";
import { actionable, checkClaims, prefilter, resolveLinkedContent, splitSections } from "context-diff";
import { cqlResolver, getPage, remoteLinkResolver } from "./confluence";
import { hash } from "./hash";
import { forgeLlm } from "./llm";
import { buildPrompt } from "./prompt";
import { getPageCheck, savePageCheck } from "./store";
import type { CheckJob, PageCheck, StoredFinding } from "./types";

const MAX_PAGES = 8;

/** Async consumer: find linked pages, check relevant sections, store findings. */
export async function checkWorker(event: AsyncEvent<CheckJob>): Promise<void> {
  const { issueKey, parentKey, facts } = event.body;
  const lookup = parentKey ? { issueKey, parentKey } : { issueKey };
  const { refs, errors } = await resolveLinkedContent(lookup, [remoteLinkResolver, cqlResolver], {
    limit: MAX_PAGES,
  });
  console.log(`[worker] ${issueKey}: ${refs.length} candidate page(s)`, refs.map((r) => `${r.id} via ${r.via.join("+")}`));
  for (const e of errors) console.warn(`resolver ${e.resolver} failed`, e.error);

  for (const ref of refs) {
    try {
      const page = await getPage(ref.id);
      const sections = splitSections(page.doc);
      const candidates = prefilter(facts, sections).map((s) => s.section);

      const { findings, failures } = candidates.length
        ? await checkClaims({ facts, sections: candidates, llm: forgeLlm, buildPrompt })
        : { findings: [], failures: [] };
      console.log(`[worker] page ${page.id} "${page.title}": ${sections.length} sections, ${candidates.length} sent to LLM, ${findings.length} findings`, findings.map((f) => `${f.sectionId}=${f.status}@${f.confidence}`));
      for (const f of failures) console.warn(`check failed for ${page.id} ${f.sectionIds.join(",")}`, f.error);

      // A failed check must never look like "up to date": skip the save if nothing was checked,
      // and keep earlier findings for sections whose batch failed.
      const failedIds = new Set(failures.flatMap((f) => f.sectionIds));
      if (candidates.length > 0 && failedIds.size === candidates.length) {
        console.error(`[worker] page ${page.id}: all checks failed, keeping previous findings`);
        continue;
      }
      const previous = failedIds.size ? ((await getPageCheck(page.id, issueKey, api.asApp()))?.findings ?? []) : [];
      const kept = previous.filter((f) => failedIds.has(f.sectionId));

      const byId = new Map(sections.map((s) => [s.id, s]));
      const fresh: StoredFinding[] = actionable(findings, { includeUncertain: true }).flatMap((f) => {
        const s = byId.get(f.sectionId);
        return s ? [{ ...f, heading: s.heading, currentText: s.text, textHash: hash(s.text), complex: s.complex }] : [];
      });
      const stored = [...fresh, ...kept];

      const check: PageCheck = {
        pageId: page.id,
        pageTitle: page.title,
        pageVersion: page.version,
        issueKey,
        checkedAt: new Date().toISOString(),
        findings: stored,
      };
      if (page.url) check.pageUrl = page.url;
      await savePageCheck(check);
    } catch (error) {
      // One bad page shouldn't stop the others.
      console.error(`page ${ref.id} failed`, error);
    }
  }
}
