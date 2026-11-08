import type { ChangeFact } from "./types.js";

/** A Jira changelog item as delivered in issue events and the changelog API. */
export interface JiraChangelogItem {
  field: string;
  fieldId?: string;
  fieldtype?: string;
  from?: string | null;
  fromString?: string | null;
  to?: string | null;
  toString?: string | null;
}

export interface NormalizeOptions {
  /** Field names or ids to keep (case-insensitive). Default: DEFAULT_JIRA_FIELDS. Pass "*" to keep all. */
  include?: string[] | "*";
  /** Field names or ids to drop (case-insensitive). */
  exclude?: string[];
  at?: string;
  url?: string;
}

/** Fields that commonly change what documentation should say. */
export const DEFAULT_JIRA_FIELDS = [
  "status",
  "resolution",
  "summary",
  "description",
  "fix version",
  "fixversions",
  "labels",
  "components",
  "acceptance criteria",
];

/** Fields that never matter for docs. */
const NOISE_FIELDS = new Set(["rank", "sprint", "timespent", "timeestimate", "worklogid", "watches"]);

/** Turn Jira changelog items into ChangeFacts. Skips no-op and noise changes. */
export function normalizeJiraChangelog(
  issueKey: string,
  items: JiraChangelogItem[],
  opts: NormalizeOptions = {},
): ChangeFact[] {
  const include =
    opts.include === "*" ? null : new Set((opts.include ?? DEFAULT_JIRA_FIELDS).map((f) => f.toLowerCase()));
  const exclude = new Set((opts.exclude ?? []).map((f) => f.toLowerCase()));

  const keep = (item: JiraChangelogItem) => {
    const names = [item.field, item.fieldId].filter(Boolean).map((n) => n!.toLowerCase());
    if (names.some((n) => NOISE_FIELDS.has(n) || exclude.has(n))) return false;
    return include === null || names.some((n) => include.has(n));
  };

  return items.filter(keep).flatMap((item): ChangeFact[] => {
    const from = clean(item.fromString ?? item.from);
    const to = clean(item.toString ?? item.to);
    if (from === to) return [];
    return [
      {
        source: `jira:${issueKey}`,
        field: item.field,
        from,
        to,
        ...(opts.at ? { at: opts.at } : {}),
        ...(opts.url ? { url: opts.url } : {}),
      },
    ];
  });
}

function clean(value: string | null | undefined): string | null {
  if (value === undefined || value === null) return null;
  const v = value.trim();
  return v === "" ? null : v;
}
