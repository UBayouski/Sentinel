import api, { route } from "@forge/api";
import Resolver from "@forge/resolver";
import { DEFAULT_SETTINGS, FIELD_OPTIONS, getSettings, saveSettings, type Settings } from "./settings";

// Backend for the Jira admin page only (jira:adminPage is limited to Jira admins).
const resolver = new Resolver();

resolver.define("getSettings", async () => {
  const [settings, projects, spaces] = await Promise.all([getSettings(), listProjects(), listSpaces()]);
  return { settings, defaults: DEFAULT_SETTINGS, fieldOptions: FIELD_OPTIONS.map(({ value, label }) => ({ value, label })), projects, spaces };
});

resolver.define("saveSettings", async ({ payload }) => {
  const saved = await saveSettings(payload as Partial<Settings>);
  console.log("[settings] saved", saved);
  return { ok: true, settings: saved };
});

/** Projects the admin can see, for the picker. */
async function listProjects(): Promise<{ value: string; label: string }[]> {
  try {
    const res = await api.asUser().requestJira(route`/rest/api/3/project/search?maxResults=100&orderBy=name`);
    if (!res.ok) return [];
    const body = (await res.json()) as { values: { key: string; name: string }[] };
    return body.values.map((p) => ({ value: p.key, label: `${p.name} (${p.key})` }));
  } catch {
    return [];
  }
}

/** Confluence spaces the admin can see. Empty if Confluence isn't reachable from here. */
async function listSpaces(): Promise<{ value: string; label: string }[]> {
  try {
    const res = await api.asUser().requestConfluence(route`/wiki/api/v2/spaces?limit=100&type=global&status=current`);
    if (!res.ok) return [];
    const body = (await res.json()) as { results: { key: string; name: string }[] };
    return body.results.map((s) => ({ value: s.key, label: `${s.name} (${s.key})` }));
  } catch {
    return [];
  }
}

export const settingsResolver = resolver.getDefinitions();
