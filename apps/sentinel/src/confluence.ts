import api, { route } from "@forge/api";
import type { AdfDoc, Resolver } from "context-diff";

type Fetcher = ReturnType<typeof api.asApp> | ReturnType<typeof api.asUser>;

export interface PageLookup {
  issueKey: string;
  parentKey?: string;
}

export interface Page {
  id: string;
  title: string;
  version: number;
  url?: string;
  doc: AdfDoc;
}

async function json<T>(res: { ok: boolean; status: number; json(): Promise<unknown>; text(): Promise<string> }): Promise<T> {
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${(await res.text()).slice(0, 200)}`);
  return (await res.json()) as T;
}

/** Confluence pages attached to the issue as remote links ("mentioned on" / "linked pages"). */
export const remoteLinkResolver: Resolver<PageLookup> = {
  name: "remote-links",
  priority: 0,
  async resolve({ issueKey, parentKey }) {
    const keys = [issueKey, parentKey].filter((k): k is string => Boolean(k));
    const lists = await Promise.all(
      keys.map((key) =>
        api
          .asApp()
          .requestJira(route`/rest/api/3/issue/${key}/remotelink`)
          .then((r) => json<RemoteLink[]>(r)),
      ),
    );
    return lists.flat().flatMap((link) => {
      const id = pageIdFrom(link);
      return id ? [{ id, kind: "confluence:page", title: link.object?.title, url: link.object?.url }] : [];
    });
  },
};

/** Pages whose text mentions the issue key (or its parent epic). */
export const cqlResolver: Resolver<PageLookup> = {
  name: "cql-mentions",
  priority: 1,
  async resolve({ issueKey, parentKey }) {
    const keys = [issueKey, parentKey].filter((k): k is string => Boolean(k));
    const cql = `type = page AND (${keys.map((k) => `text ~ "${k}"`).join(" OR ")})`;
    const res = await api
      .asApp()
      .requestConfluence(route`/wiki/rest/api/search?cql=${cql}&limit=10`)
      .then((r) => json<{ results: SearchResult[]; _links?: { base?: string } }>(r));
    return res.results.flatMap((r) =>
      r.content?.id
        ? [{ id: r.content.id, kind: "confluence:page", title: r.content.title, url: r.url ?? r.content._links?.webui }]
        : [],
    );
  },
};

export async function getPage(pageId: string, as: Fetcher = api.asApp()): Promise<Page> {
  const page = await as
    .requestConfluence(route`/wiki/api/v2/pages/${pageId}?body-format=atlas_doc_format`)
    .then((r) => json<PageResponse>(r));
  return {
    id: page.id,
    title: page.title,
    version: page.version.number,
    url: page._links?.base && page._links.webui ? page._links.base + page._links.webui : page._links?.webui,
    doc: JSON.parse(page.body.atlas_doc_format.value) as AdfDoc,
  };
}

/** Write a new version of the page. Fails with 409 if someone else saved in between. */
export async function updatePage(page: Page, doc: AdfDoc, message: string, as: Fetcher): Promise<void> {
  const res = await as.requestConfluence(route`/wiki/api/v2/pages/${page.id}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({
      id: page.id,
      status: "current",
      title: page.title,
      body: { representation: "atlas_doc_format", value: JSON.stringify(doc) },
      version: { number: page.version + 1, message },
    }),
  });
  await json(res);
}

function pageIdFrom(link: RemoteLink): string | null {
  const fromGlobal = /pageId=(\d+)/.exec(link.globalId ?? "")?.[1];
  if (fromGlobal) return fromGlobal;
  const fromUrl = /\/pages\/(\d+)/.exec(link.object?.url ?? "")?.[1] ?? /pageId=(\d+)/.exec(link.object?.url ?? "")?.[1];
  return fromUrl ?? null;
}

interface RemoteLink {
  globalId?: string;
  application?: { type?: string };
  object?: { url?: string; title?: string };
}
interface SearchResult {
  url?: string;
  content?: { id: string; title?: string; _links?: { webui?: string } };
}
interface PageResponse {
  id: string;
  title: string;
  version: { number: number };
  body: { atlas_doc_format: { value: string } };
  _links?: { webui?: string; base?: string };
}
