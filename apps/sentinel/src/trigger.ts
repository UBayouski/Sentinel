import { Queue } from "@forge/events";
import { normalizeJiraChangelog, type JiraChangelogItem } from "context-diff";
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
  const facts = normalizeJiraChangelog(issueKey, event.changelog?.items ?? [], {
    at: new Date().toISOString(),
  });
  console.log(`[trigger] ${issueKey}: ${facts.length} doc-relevant change(s)`, facts.map((f) => f.field));
  if (facts.length === 0) return;

  const job: CheckJob = { issueKey, facts };
  const parentKey = event.issue.fields?.parent?.key;
  if (parentKey) job.parentKey = parentKey;
  // One check per issue at a time keeps LLM usage and page writes predictable.
  await queue.push({ body: job, concurrency: { key: issueKey, limit: 1 } });
}
