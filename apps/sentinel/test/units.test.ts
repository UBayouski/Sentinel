import { describe, expect, it, vi } from "vitest";

// The Forge runtime isn't available in tests; these modules only touch it inside functions.
vi.mock("@forge/api", () => ({ default: {}, route: () => "", __getRuntime: () => ({}) }));
vi.mock("@forge/events", () => ({ Queue: class {} }));
vi.mock("@forge/kvs", () => ({ kvs: {} }));

const { mentionsKey } = await import("../src/confluence");
const { collectPages } = await import("../src/twg");
const { buildPrompt } = await import("../src/prompt");

describe("mentionsKey", () => {
  it("matches the key as a whole token", () => {
    expect(mentionsKey("Owner: Payments team. Tracks PAY-1. Last", "PAY-1")).toBe(true);
    expect(mentionsKey("<p>PAY-1</p>", "PAY-1")).toBe(true);
  });
  it("ignores longer keys, prefixes and fuzzy text", () => {
    expect(mentionsKey("see PAY-12", "PAY-1")).toBe(false);
    expect(mentionsKey("XPAY-1", "PAY-1")).toBe(false);
    expect(mentionsKey("How do I pay 1 invoice", "PAY-1")).toBe(false);
  });
});

describe("collectPages (Teamwork Graph results)", () => {
  it("finds pages at any depth, dedupes, and takes the numeric id from the ARI or URL", () => {
    const data = {
      customQuery: {
        edges: [
          { node: { columns: [{ key: "p", value: { __typename: "CypherQueryResultNode", data: { __typename: "ConfluencePage", id: "ari:cloud:confluence:abc:page/123", title: "Spec", webUrl: "https://x/wiki/spaces/S/pages/123/Spec" } } }] } },
          { node: { columns: [{ key: "p", value: { __typename: "CypherQueryResultListNode", nodes: [
            { data: { __typename: "ConfluencePage", id: "opaque", webUrl: "https://x/wiki/spaces/S/pages/456/Other" } },
            { data: { __typename: "ConfluencePage", id: "ari:cloud:confluence:abc:page/123" } },
            { data: { __typename: "JiraWorkItem", id: "ari:cloud:jira:abc:issue/9" } },
          ] } }] } },
        ],
      },
    };
    expect(collectPages(data).map((p) => p.id).sort()).toEqual(["123", "456"]);
  });
});

describe("buildPrompt", () => {
  const sections = [{ id: "retry", heading: "Retry", level: 2, text: "Retried 3 times.", range: [0, 2] as [number, number], complex: false }];
  it("shows a changelog fact as old → new", () => {
    const p = buildPrompt([{ source: "jira:PAY-1", field: "Description", from: "3 retries", to: "no retries" }], sections);
    expect(p).toContain('Description: "3 retries" → "no retries"');
  });
  it("shows an on-demand fact as the current value", () => {
    const p = buildPrompt([{ source: "jira:PAY-1", field: "Description", to: "no retries" }], sections);
    expect(p).toContain('Description (current value) → "no retries"');
  });
});
