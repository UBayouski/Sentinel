import { beforeEach, describe, expect, it, vi } from "vitest";

const store = new Map<string, unknown>();
vi.mock("@forge/kvs", () => ({
  kvs: {
    get: async (k: string) => store.get(k),
    set: async (k: string, v: unknown) => void store.set(k, v),
  },
}));

const { DEFAULT_SETTINGS, getSettings, saveSettings, watchedFieldNames, watchesProject } = await import("../src/settings");

beforeEach(() => store.clear());

describe("settings", () => {
  it("falls back to defaults", async () => {
    expect(await getSettings()).toEqual(DEFAULT_SETTINGS);
  });

  it("sanitises what the admin page sends", async () => {
    const saved = await saveSettings({
      projects: ["pay", " ops ", "not a key!", "PAY"],
      fields: ["Description", "bogus"],
      extraFields: [" Business rules ", "", "Business rules"],
      spaces: ["paydocs", "~personal"],
      minConfidence: 7,
      maxPages: 0,
    });
    expect(saved.projects).toEqual(["PAY", "OPS"]);
    expect(saved.fields).toEqual(["description"]);
    expect(saved.extraFields).toEqual(["Business rules"]);
    expect(saved.spaces).toEqual(["PAYDOCS", "~PERSONAL"]);
    expect(saved.minConfidence).toBe(1);
    expect(saved.maxPages).toBe(1);
    expect(saved.enabled).toBe(true);
    expect(await getSettings()).toEqual(saved);
  });

  it("maps picked fields to Jira changelog names, plus custom fields", () => {
    const names = watchedFieldNames({ ...DEFAULT_SETTINGS, fields: ["fix versions", "summary"], extraFields: ["Business Rules"] });
    expect(names).toEqual(["summary", "fix version", "fixversions", "business rules"]);
  });

  it("watches all projects when none are picked", () => {
    expect(watchesProject(DEFAULT_SETTINGS, "PAY-1")).toBe(true);
    expect(watchesProject({ ...DEFAULT_SETTINGS, projects: ["OPS"] }, "PAY-1")).toBe(false);
    expect(watchesProject({ ...DEFAULT_SETTINGS, projects: ["PAY"] }, "pay-12")).toBe(true);
  });
});
