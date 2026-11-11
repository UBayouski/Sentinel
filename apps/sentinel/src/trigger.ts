import api, { route } from "@forge/api";
import { Queue } from "@forge/events";
import { extractText, normalizeJiraChangelog, type AdfNode, type ChangeFact, type JiraChangelogItem } from "context-diff";
import { getSettings, watchedFieldNames, watchesProject } from "./settings";
import type { CheckJob } from "./types";

const queue = new Queue<CheckJob>({ key: "doc-checks" });

interface IssueUpdatedEvent {
  issue: { key: string; fields?: { parent?: { key?: string } } };
  changelog?: { items?: JiraChangelogItem[] };
}

/** Jira issue updated → keep only doc-relevant changes → queue a check. Must stay fast. */
export async function onIssueChanged(event: IssueUpdatedEvent): Promise<void> {
  const issueKey = event.issue?.key;
  if (!issueKey) return;
  const settings = await getSettings();
  if (!settings.enabled || !watchesProject(settings, issueKey)) return;
  const facts = normalizeJiraChangelog(issueKey, event.changelog?.items ?? [], {
    include: watchedFieldNames(settings),
    at: new Date().toISOString(),
  });
  console.log(`[trigger] ${issueKey}: ${facts.length} doc-relevant change(s)`, facts.map((f) => f.field));
  if (facts.length === 0) return;

  await enqueue(issueKey, facts, event.issue.fields?.parent?.key);
}

async function enqueue(issueKey: string, facts: ChangeFact[], parentKey?: string, pageIds: string[] = []) {
  const job: CheckJob = { issueKey, facts };
  if (parentKey) job.parentKey = parentKey;
  if (pageIds.length) job.pageIds = pageIds;
  // One check per issue at a time keeps LLM usage and page writes predictable.
  await queue.push({ body: job, concurrency: { key: issueKey, limit: 1 } });
}

/**
 * On-demand check (Rovo agent): compare linked docs with the issue's current summary and description.
 * Reads the issue as the user, so people can only trigger checks for issues they can see.
 */
export async function queueCurrentStateCheck(
  issueKey: string,
  pageIds: string[] = [],
): Promise<{ ok: boolean; reason?: string }> {
  const res = await api
    .asUser()
    .requestJira(route`/rest/api/3/issue/${issueKey}?fields=summary,description,parent`);
  if (res.status === 404 || res.status === 403) return { ok: false, reason: `Issue ${issueKey} not found or not visible to you.` };
  if (!res.ok) return { ok: false, reason: `Couldn't read ${issueKey} (HTTP ${res.status}).` };
  const issue = (await res.json()) as {
    fields: { summary?: string; description?: AdfNode | null; parent?: { key?: string } };
  };
  const at = new Date().toISOString();
  const source = `jira:${issueKey}`;
  const description = issue.fields.description ? extractText(issue.fields.description).trim() : "";
  const facts: ChangeFact[] = [];
  if (issue.fields.summary) facts.push({ source, field: "Summary", to: issue.fields.summary, at });
  if (description) facts.push({ source, field: "Description", to: description, at });
  if (facts.length === 0) return { ok: false, reason: `${issueKey} has no summary or description to check against.` };
  await enqueue(issueKey, facts, issue.fields.parent?.key, pageIds);
  console.log(`[trigger] on-demand check queued for ${issueKey}`);
  return { ok: true };
}
