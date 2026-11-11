import { kvs } from "@forge/kvs";

// Admin settings, edited on the Jira admin page and stored in the Jira installation's storage,
// where the trigger and worker run. Checks queued from Confluence (agent) use the defaults.

/** Jira fields admins can pick, mapped to the changelog names Jira uses for them. */
export const FIELD_OPTIONS: { value: string; label: string; names: string[] }[] = [
  { value: "summary", label: "Summary", names: ["summary"] },
  { value: "description", label: "Description", names: ["description"] },
  { value: "acceptance criteria", label: "Acceptance criteria", names: ["acceptance criteria"] },
  { value: "status", label: "Status", names: ["status"] },
  { value: "resolution", label: "Resolution", names: ["resolution"] },
  { value: "fix versions", label: "Fix versions", names: ["fix version", "fixversions"] },
  { value: "labels", label: "Labels", names: ["labels"] },
  { value: "components", label: "Components", names: ["components"] },
];

export interface Settings {
  /** Master switch for automatic checks on issue updates. */
  enabled: boolean;
  /** Project keys to watch. Empty = all projects. */
  projects: string[];
  /** Watched fields (FIELD_OPTIONS values). */
  fields: string[];
  /** Extra field names, e.g. custom fields ("Business rules"). */
  extraFields: string[];
  /** Confluence space keys to check. Empty = all spaces. */
  spaces: string[];
  /** Findings below this confidence are not shown. */
  minConfidence: number;
  /** Also show "maybe outdated" findings. */
  includeUncertain: boolean;
  /** Most pages checked per issue change. */
  maxPages: number;
}

export const DEFAULT_SETTINGS: Settings = {
  enabled: true,
  projects: [],
  fields: FIELD_OPTIONS.map((f) => f.value),
  extraFields: [],
  spaces: [],
  minConfidence: 0.6,
  includeUncertain: true,
  maxPages: 8,
};

const KEY = "settings";

export async function getSettings(): Promise<Settings> {
  const stored = await kvs.get<Partial<Settings>>(KEY);
  return { ...DEFAULT_SETTINGS, ...(stored ?? {}) };
}

/** Validate and store. Returns the saved value. */
export async function saveSettings(input: Partial<Settings>): Promise<Settings> {
  const keys = (v: unknown, re: RegExp) =>
    [...new Set((Array.isArray(v) ? v : []).map((s) => String(s).trim().toUpperCase()).filter((s) => re.test(s)))];
  const known = new Set(FIELD_OPTIONS.map((f) => f.value));
  const settings: Settings = {
    enabled: input.enabled !== false,
    projects: keys(input.projects, /^[A-Z][A-Z0-9_]{0,19}$/),
    fields: [...new Set((input.fields ?? []).map((f) => String(f).toLowerCase()).filter((f) => known.has(f)))],
    extraFields: [
      ...new Set((input.extraFields ?? []).map((f) => String(f).trim()).filter((f) => f.length > 0 && f.length <= 80)),
    ].slice(0, 20),
    spaces: keys(input.spaces, /^[A-Z0-9~][A-Z0-9_~]{0,254}$/),
    minConfidence: clamp(Number(input.minConfidence ?? DEFAULT_SETTINGS.minConfidence), 0, 1),
    includeUncertain: input.includeUncertain !== false,
    maxPages: Math.round(clamp(Number(input.maxPages ?? DEFAULT_SETTINGS.maxPages), 1, 20)),
  };
  await kvs.set(KEY, settings);
  return settings;
}

/** Changelog field names to keep, for normalizeJiraChangelog's `include`. */
export function watchedFieldNames(s: Settings): string[] {
  const names = FIELD_OPTIONS.filter((f) => s.fields.includes(f.value)).flatMap((f) => f.names);
  return [...names, ...s.extraFields.map((f) => f.toLowerCase())];
}

export function watchesProject(s: Settings, issueKey: string): boolean {
  return s.projects.length === 0 || s.projects.includes(issueKey.split("-")[0]!.toUpperCase());
}

function clamp(n: number, min: number, max: number) {
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : min;
}
