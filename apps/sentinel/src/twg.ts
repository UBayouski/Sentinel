import api, { __getRuntime, route } from "@forge/api";
import type { ContentRef, Resolver } from "context-diff";
import type { PageLookup } from "./confluence";

// Teamwork Graph page finder: Confluence pages the graph links to a Jira issue.
//
// New apps can't send raw Cypher, so the queries below are registered once as persisted queries
// (see README, "Teamwork Graph"), and their keys are set, comma-separated, with
//   forge variables set TWG_ISSUE_PAGES_QUERY <key1>,<key2>
// Without that variable this finder is skipped. The graph API only works as a user,
// so it runs from the Rovo agent, not the background worker.

/** Both link directions: the issue links to the page, and the page links to (mentions) the issue. */
export const ISSUE_PAGES_CYPHER = {
  itemToPage: "MATCH (w:JiraWorkItem {ari: $issueAri})-[:content_entity_links_entity]->(p:ConfluencePage) RETURN p",
  pageToItem: "MATCH (p:ConfluencePage)-[:content_entity_links_entity]->(w:JiraWorkItem {ari: $issueAri}) RETURN p",
};

// Operation names must look like company_operation, or the API answers 200 with errors.
const OPERATION = "sentinel_issuePages";
const QUERY = `query ${OPERATION}($queryKey: String!, $queryParams: CypherRequestParams) {
  customQuery(queryKey: $queryKey, queryParams: $queryParams, first: 25) {
    edges { node { columns { key value { __typename
      ... on CypherQueryResultNode { id data { __typename ... on ConfluencePage { id title webUrl } } }
      ... on CypherQueryResultListNode { nodes { id data { __typename ... on ConfluencePage { id title webUrl } } } }
    } } } }
  }
}`;

export const teamworkGraphResolver: Resolver<PageLookup> = {
  name: "teamwork-graph",
  priority: 2,
  async resolve({ issueKey }) {
    const keys = (process.env.TWG_ISSUE_PAGES_QUERY ?? "").split(",").map((k) => k.trim()).filter(Boolean);
    if (keys.length === 0) return [];

    const issueAri = await issueAriFor(issueKey);
    const results = await Promise.all(keys.map((queryKey) => runQuery(queryKey, issueAri)));
    const pages = [...new Map(results.flat().map((p) => [p.id, p])).values()];
    console.log(`[twg] ${issueKey}: ${pages.length} page(s)`);
    return pages;
  },
};

async function runQuery(queryKey: string, issueAri: string) {
  const res = await api.asUser().requestTeamworkGraph(QUERY, { queryKey, queryParams: { issueAri } }, OPERATION);
  const body = (await res.json()) as { data?: unknown; errors?: { message: string; extensions?: { code?: string } }[] };
  // Failures often come back as HTTP 200 with errors and no data.
  if (!res.ok || body.errors?.length || !body.data) {
    const why = body.errors?.map((e) => e.extensions?.code ?? e.message).join("; ") ?? "no data";
    throw new Error(`Teamwork Graph query ${queryKey}: HTTP ${res.status} ${why}`);
  }
  return collectPages(body.data);
}

async function issueAriFor(issueKey: string): Promise<string> {
  const res = await api.asUser().requestJira(route`/rest/api/3/issue/${issueKey}?fields=summary`);
  if (!res.ok) throw new Error(`Teamwork Graph: can't read ${issueKey} (HTTP ${res.status})`);
  const { id } = (await res.json()) as { id: string };
  // contextAri looks like ari:cloud:jira::site/<cloudId> (or confluence).
  const cloudId = /site\/([0-9a-f-]+)/i.exec(__getRuntime().contextAri ?? "")?.[1];
  if (!cloudId) throw new Error("Teamwork Graph: no cloud id in the runtime context");
  return `ari:cloud:jira:${cloudId}:issue/${id}`;
}

/** Pull every ConfluencePage out of the result, whatever nesting the graph used. */
export function collectPages(data: unknown): Omit<ContentRef, "via" | "rank">[] {
  const found = new Map<string, Omit<ContentRef, "via" | "rank">>();
  const walk = (v: unknown) => {
    if (!v || typeof v !== "object") return;
    if (Array.isArray(v)) return v.forEach(walk);
    const o = v as Record<string, unknown>;
    const pageId = o.__typename === "ConfluencePage" ? numericPageId(o) : undefined;
    if (pageId) {
      const ref: Omit<ContentRef, "via" | "rank"> = { id: pageId, kind: "confluence:page" };
      if (typeof o.title === "string") ref.title = o.title;
      if (typeof o.webUrl === "string") ref.url = o.webUrl;
      found.set(ref.id, ref);
    }
    Object.values(o).forEach(walk);
  };
  walk(data);
  return [...found.values()];
}

/** The graph id is an ARI (…:page/123); fall back to the page URL (/pages/123/…). */
function numericPageId(o: Record<string, unknown>): string | undefined {
  return /page\/(\d+)/.exec(String(o.id ?? ""))?.[1] ?? /\/pages\/(\d+)/.exec(String(o.webUrl ?? ""))?.[1];
}
