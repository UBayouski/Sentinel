import api, { route } from "@forge/api";
import type { AdfDoc, Resolver } from "context-diff";

type Fetcher = ReturnType<typeof api.asApp> | ReturnType<typeof api.asUser>;

export interface PageLookup {
  issueKey: string;
  parentKey?: string;
  /** Only search these space keys (admin setting). */
  spaces?: string[];
}

export interface Page {
  id: string;
  title: string;
  version: number;
  url?: string;
  spaceId?: string;
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

/**
 * Pages whose text mentions the issue key (or its parent epic).
 * Plain `text ~ "PAY-1"` is fuzzy (it matches any page with "pay" and "1"), so search for the exact
 * phrase, then keep only pages whose body contains the key itself (not PAY-10).
 */
export const cqlResolver: Resolver<PageLookup> = {
  name: "cql-mentions",
  priority: 1,
  async resolve({ issueKey, parentKey, spaces }) {
    const keys = [issueKey, parentKey].filter((k): k is string => Boolean(k));
    const inSpaces = spaces?.length ? ` AND space in (${spaces.map((s) => `"${s}"`).join(",")})` : "";
    const cql = `type = page${inSpaces} AND (${keys.map((k) => `text ~ "\\"${k}\\""`).join(" OR ")})`;
    const res = await api
      .asApp()
      .requestConfluence(route`/wiki/rest/api/content/search?cql=${cql}&limit=10&expand=body.storage`)
      .then((r) => json<{ results: ContentResult[]; _links?: { base?: string } }>(r));
    return res.results.flatMap((p) => {
      const body = p.body?.storage?.value ?? "";
      if (!keys.some((k) => mentionsKey(body, k))) return [];
      const url = res._links?.base && p._links?.webui ? res._links.base + p._links.webui : p._links?.webui;
      return [{ id: p.id, kind: "confluence:page", title: p.title, ...(url ? { url } : {}) }];
    });
  },
};

export function mentionsKey(text: string, key: string): boolean {
  return new RegExp(`(^|[^A-Za-z0-9-])${key.replace(/[-]/g, "\\-")}(?![0-9])`).test(text);
}

export async function getPage(pageId: string, as: Fetcher = api.asApp()): Promise<Page> {
  const page = await as
    .requestConfluence(route`/wiki/api/v2/pages/${pageId}?body-format=atlas_doc_format`)
    .then((r) => json<PageResponse>(r));
  return {
    id: page.id,
    title: page.title,
    version: page.version.number,
    ...(page.spaceId ? { spaceId: String(page.spaceId) } : {}),
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
interface ContentResult {
  id: string;
  title: string;
  body?: { storage?: { value?: string } };
  _links?: { webui?: string };
}
interface PageResponse {
  id: string;
  spaceId?: string | number;
  title: string;
  version: { number: number };
  body: { atlas_doc_format: { value: string } };
  _links?: { webui?: string; base?: string };
}

/** Page finders, best first. The worker and the Rovo agent use the same list. */
export const PAGE_RESOLVERS: Resolver<PageLookup>[] = [remoteLinkResolver, cqlResolver];

/** Space ids for space keys (v2 pages only carry the id). */
export async function spaceIdsForKeys(keys: string[]): Promise<Set<string>> {
  const res = await api
    .asApp()
    .requestConfluence(route`/wiki/api/v2/spaces?keys=${keys.join(",")}&limit=250`)
    .then((r) => json<{ results: { id: string | number }[] }>(r));
  return new Set(res.results.map((s) => String(s.id)));
}
