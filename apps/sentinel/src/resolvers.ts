import api from "@forge/api";
import Resolver from "@forge/resolver";
import { applyFinding, dismissFinding, type FixRequest } from "./fixes";
import { getIssueChecks, getPageChecks } from "./store";

const resolver = new Resolver();

type Ctx = { extension?: { content?: { id?: string | number }; issue?: { key?: string } } };

/** Findings for the page the user is looking at (byline popup and page banner). */
resolver.define("getPageFindings", async ({ context }) => {
  const pageId = (context as Ctx).extension?.content?.id;
  if (!pageId) {
    console.warn("[ui] getPageFindings: no page id in context", Object.keys((context as Ctx).extension ?? {}));
    return { checks: [], error: "Couldn't tell which page this is." };
  }
  const checks = await getPageChecks(String(pageId), api.asUser());
  console.log(`[ui] getPageFindings ${pageId}: ${checks.length} check(s)`);
  return { checks: checks.filter((c) => c.findings.length > 0) };
});

/** Pages affected by the current issue (Jira installation). Only pages the user can read come back. */
resolver.define("getIssueDocs", async ({ context }) => {
  const key = (context as Ctx).extension?.issue?.key;
  if (!key) return { checks: [], error: "Couldn't tell which issue this is." };
  return { checks: await getIssueChecks(key, api.asUser()) };
});

resolver.define("applyFix", async ({ payload }) => {
  const res = await applyFinding(payload as unknown as FixRequest);
  console.log(`[ui] applyFix`, res);
  return res;
});

resolver.define("dismiss", async ({ payload }) => {
  const res = await dismissFinding(payload as unknown as FixRequest);
  console.log(`[ui] dismiss`, res);
  return res;
});

export const uiResolver = resolver.getDefinitions();
