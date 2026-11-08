import api, { route } from "@forge/api";
import { kvs } from "@forge/kvs";
import type { IssueIndex, PageCheck } from "./types";

// Findings live on the Confluence page as a content property, so both installations
// (Jira, where the worker runs, and Confluence, where the byline runs) can read them,
// and Confluence page permissions apply. KVS is per installation, so it only holds
// the Jira-side issue → pages index.

type Fetcher = ReturnType<typeof api.asApp> | ReturnType<typeof api.asUser>;

const PROPERTY_KEY = "sentinel-findings";
const issueIndexKey = (key: string) => `i:${key}`;

interface PropertyValue {
  checks: PageCheck[];
}
interface Property {
  id: string;
  value: PropertyValue;
  version: { number: number };
}

async function readProperty(pageId: string, as: Fetcher): Promise<Property | null> {
  const res = await as.requestConfluence(route`/wiki/api/v2/pages/${pageId}/properties?key=${PROPERTY_KEY}`);
  if (res.status === 403 || res.status === 404) return null;
  if (!res.ok) throw new Error(`read property ${pageId}: HTTP ${res.status} ${await res.text()}`);
  const body = (await res.json()) as { results?: Property[] };
  return body.results?.[0] ?? null;
}

async function writeProperty(pageId: string, existing: Property | null, value: PropertyValue, as: Fetcher) {
  const res = existing
    ? await as.requestConfluence(route`/wiki/api/v2/pages/${pageId}/properties/${existing.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key: PROPERTY_KEY, value, version: { number: existing.version.number + 1 } }),
      })
    : await as.requestConfluence(route`/wiki/api/v2/pages/${pageId}/properties`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key: PROPERTY_KEY, value }),
      });
  if (!res.ok) {
    const err = new Error(`write property ${pageId}: HTTP ${res.status} ${await res.text()}`);
    (err as Error & { status?: number }).status = res.status;
    throw err;
  }
}

/** Read-modify-write the page's checks, retrying once on a version conflict. */
async function updateChecks(pageId: string, as: Fetcher, fn: (checks: PageCheck[]) => PageCheck[]) {
  for (let attempt = 0; ; attempt++) {
    const existing = await readProperty(pageId, as);
    const checks = fn(existing?.value.checks ?? []);
    try {
      await writeProperty(pageId, existing, { checks }, as);
      return;
    } catch (e) {
      const status = (e as { status?: number }).status;
      if (attempt === 0 && (status === 409 || status === 400)) continue;
      throw e;
    }
  }
}

/** Called by the worker (Jira installation). */
export async function savePageCheck(check: PageCheck): Promise<void> {
  await updateChecks(check.pageId, api.asApp(), (checks) => [
    ...checks.filter((c) => c.issueKey !== check.issueKey),
    check,
  ]);
  const index = (await kvs.get<IssueIndex>(issueIndexKey(check.issueKey))) ?? {
    issueKey: check.issueKey,
    pageIds: [],
    updatedAt: "",
  };
  if (!index.pageIds.includes(check.pageId)) index.pageIds.push(check.pageId);
  index.updatedAt = check.checkedAt;
  await kvs.set(issueIndexKey(check.issueKey), index);
}

/** All checks for a page. Returns [] if the caller can't read the page. */
export async function getPageChecks(pageId: string, as: Fetcher): Promise<PageCheck[]> {
  return (await readProperty(pageId, as))?.value.checks ?? [];
}

export async function getPageCheck(pageId: string, issue: string, as: Fetcher): Promise<PageCheck | undefined> {
  return (await getPageChecks(pageId, as)).find((c) => c.issueKey === issue);
}

/** Pages checked for an issue (Jira installation), limited to pages the caller can read. */
export async function getIssueChecks(key: string, as: Fetcher): Promise<PageCheck[]> {
  const index = await kvs.get<IssueIndex>(issueIndexKey(key));
  if (!index) return [];
  const checks = await Promise.all(index.pageIds.map((id) => getPageCheck(id, key, as)));
  return checks.filter((c): c is PageCheck => Boolean(c));
}

/** Remove one finding (after apply or dismiss). */
export async function removeFinding(pageId: string, issue: string, sectionId: string, as: Fetcher): Promise<void> {
  await updateChecks(pageId, as, (checks) =>
    checks.map((c) =>
      c.issueKey === issue ? { ...c, findings: c.findings.filter((f) => f.sectionId !== sectionId) } : c,
    ),
  );
}
