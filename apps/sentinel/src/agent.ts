import api from "@forge/api";
import { resolveLinkedContent } from "context-diff";
import { PAGE_RESOLVERS, type PageLookup } from "./confluence";
import { applyFinding, dismissFinding } from "./fixes";
import { getIssueChecks, getPageChecks } from "./store";
import { queueCurrentStateCheck } from "./trigger";
import { teamworkGraphResolver } from "./twg";
import type { PageCheck } from "./types";

// Rovo "Doc Steward" actions. Inputs arrive as top-level payload fields; payload.context says
// where the user is chatting (a Jira issue, a Confluence page, or nowhere in particular).
// Everything that reads or writes pages runs as the user, so the agent can't reveal or change
// pages the user couldn't open themselves.

interface ActionContext {
  jira?: { issueKey?: string };
  confluence?: { contentId?: string | number };
}
interface ActionPayload {
  issueKey?: string;
  pageId?: string | number;
  sectionId?: string;
  text?: string;
  context?: ActionContext;
}

/** Forge passes (payload, context); older examples nest context in the payload. Accept both. */
function withContext(payload: ActionPayload, context?: ActionContext): ActionPayload {
  return { ...payload, context: { ...payload?.context, ...context } };
}

const ISSUE_KEY = /^[A-Z][A-Z0-9_]+-\d+$/;

/** The agent runs as a user, so it can add the user-only Teamwork Graph finder. */
async function findPages(issueKey: string) {
  const { refs, errors } = await resolveLinkedContent<PageLookup>({ issueKey }, [...PAGE_RESOLVERS, teamworkGraphResolver], {
    limit: 8,
  });
  for (const e of errors) console.warn(`[agent] finder ${e.resolver} failed`, String(e.error));
  console.log(`[agent] ${issueKey}: pages`, refs.map((r) => `${r.id} via ${r.via.join("+")}`));
  return refs;
}

function issueFrom(p: ActionPayload): string | undefined {
  const key = (p.issueKey ?? p.context?.jira?.issueKey)?.trim().toUpperCase();
  return key && ISSUE_KEY.test(key) ? key : undefined;
}
function pageFrom(p: ActionPayload): string | undefined {
  const id = p.pageId ?? p.context?.confluence?.contentId;
  return id !== undefined && /^\d+$/.test(String(id)) ? String(id) : undefined;
}

/** Compact, model-friendly view of stored checks. */
function describe(checks: PageCheck[]) {
  return checks.map((c) => ({
    pageId: c.pageId,
    pageTitle: c.pageTitle,
    pageUrl: c.pageUrl,
    issueKey: c.issueKey,
    checkedAt: c.checkedAt,
    status: c.findings.length ? `${c.findings.length} section(s) may be outdated` : "up to date",
    findings: c.findings.map((f) => ({
      sectionId: f.sectionId,
      section: f.heading ?? "intro",
      status: f.status,
      confidence: f.confidence,
      why: f.reason,
      currentText: f.currentText,
      suggestedText: f.suggestedText,
      mayLoseFormatting: f.complex,
    })),
  }));
}

/** GET: stale docs for an issue (linked or mentioning pages), or for one page. */
async function findStaleDocsImpl(input: ActionPayload, ctx?: ActionContext) {
  const payload = withContext(input, ctx);
  const issueKey = issueFrom(payload);
  const pageId = pageFrom(payload);
  console.log(`[agent] findStaleDocs issue=${issueKey ?? "-"} page=${pageId ?? "-"}`);

  if (issueKey) {
    // Live lookup as well as the stored index: the index lives in the Jira installation's storage,
    // and the agent may run in the Confluence one.
    const refs = await findPages(issueKey);
    const checks = await getIssueChecks(issueKey, api.asUser(), refs.map((r) => r.id));
    const checked = new Set(checks.map((c) => c.pageId));
    return {
      issueKey,
      pages: describe(checks),
      // Found but never checked: unknown state, NOT up to date.
      notCheckedYet: refs
        .filter((r) => !checked.has(r.id))
        .map((r) => ({ pageId: r.id, title: r.title, url: r.url, foundVia: r.via, status: "not checked yet" })),
    };
  }
  if (pageId) {
    return { pageId, pages: describe(await getPageChecks(pageId, api.asUser())) };
  }
  return { error: "Tell me which Jira issue (for example PAY-1) or open the page or issue you mean." };
}

/** TRIGGER: re-check linked docs against the issue's current summary and description. */
async function checkDocsNowImpl(input: ActionPayload, ctx?: ActionContext) {
  const payload = withContext(input, ctx);
  const issueKey = issueFrom(payload);
  if (!issueKey) return { error: "Which Jira issue should I check docs for? For example PAY-1." };
  const refs = await findPages(issueKey);
  const res = await queueCurrentStateCheck(issueKey, refs.map((r) => r.id));
  return res.ok
    ? { queued: true, issueKey, note: "Check started. Results are usually ready in about a minute; ask me again then." }
    : { queued: false, issueKey, error: res.reason };
}

/** UPDATE: apply a suggested (or user-edited) fix to one section, as the user. */
async function applyDocFixImpl(input: ActionPayload, ctx?: ActionContext) {
  const payload = withContext(input, ctx);
  const issueKey = issueFrom(payload);
  const pageId = pageFrom(payload);
  if (!issueKey || !pageId || !payload.sectionId) {
    return { ok: false, error: "I need the issue key, page id and section id. Run find-stale-docs first." };
  }
  const req = { issueKey, pageId, sectionId: payload.sectionId, ...(payload.text ? { text: payload.text } : {}) };
  const res = await applyFinding(req);
  console.log(`[agent] applyDocFix`, req.pageId, req.sectionId, res);
  return res;
}

/** UPDATE: dismiss a finding without changing the page. */
async function dismissDocFindingImpl(input: ActionPayload, ctx?: ActionContext) {
  const payload = withContext(input, ctx);
  const issueKey = issueFrom(payload);
  const pageId = pageFrom(payload);
  if (!issueKey || !pageId || !payload.sectionId) {
    return { ok: false, error: "I need the issue key, page id and section id. Run find-stale-docs first." };
  }
  return dismissFinding({ issueKey, pageId, sectionId: payload.sectionId });
}

/**
 * Actions are also MCP tools (rovo:mcp). Called from an external MCP client, acting as the user
 * can fail until the user has granted the app consent, so turn failures into a message the
 * model can relay instead of an opaque error.
 */
function safely<A extends unknown[], R>(name: string, fn: (...args: A) => Promise<R>) {
  return async (...args: A): Promise<R | { ok: false; error: string }> => {
    try {
      return await fn(...args);
    } catch (e) {
      const msg = e instanceof Error ? `${e.name}: ${e.message}` : String(e);
      console.error(`[agent] ${name} failed`, msg);
      if (/NEEDS_AUTHENTICATION|NeedsAuthentication/i.test(msg)) {
        return {
          ok: false,
          error:
            "Sentinel needs your permission to act on your behalf. Open any Jira issue or Confluence page once and allow Stale Doc Sentinel when asked, then try again.",
        };
      }
      return { ok: false, error: `Sentinel couldn't complete ${name}. Details: ${msg.slice(0, 200)}` };
    }
  };
}

export const findStaleDocs = safely("find-stale-docs", findStaleDocsImpl);
export const checkDocsNow = safely("check-docs-now", checkDocsNowImpl);
export const applyDocFix = safely("apply-doc-fix", applyDocFixImpl);
export const dismissDocFinding = safely("dismiss-doc-finding", dismissDocFindingImpl);
