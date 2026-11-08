import { describe, expect, it } from "vitest";
import { splitSections } from "../src/adf.js";
import { normalizeJiraChangelog } from "../src/change.js";
import { actionable, checkClaims, parseFindings } from "../src/check.js";
import { prefilter } from "../src/prefilter.js";
import { resolveLinkedContent, type Resolver } from "../src/resolve.js";
import { specDoc } from "./fixtures.js";

const facts = normalizeJiraChangelog("PAY-12", [
  {
    field: "Acceptance criteria",
    fromString: "Failed card payments are retried 3 times",
    toString: "Failed card payments are not retried automatically; customer is notified",
  },
  { field: "Rank", fromString: "a", toString: "b" },
  { field: "status", fromString: "In Progress", toString: "In Progress" },
]);

describe("normalizeJiraChangelog", () => {
  it("keeps relevant fields and drops noise and no-ops", () => {
    expect(facts).toHaveLength(1);
    expect(facts[0]).toMatchObject({ source: "jira:PAY-12", field: "Acceptance criteria" });
  });

  it("supports include '*' and exclude", () => {
    const items = [
      { field: "Story Points", fromString: "3", toString: "5" },
      { field: "Summary", fromString: "a", toString: "b" },
    ];
    expect(normalizeJiraChangelog("X-1", items, { include: "*" })).toHaveLength(2);
    expect(normalizeJiraChangelog("X-1", items, { include: "*", exclude: ["summary"] })).toHaveLength(1);
  });
});

describe("prefilter", () => {
  it("ranks the section the change is about first and keeps key mentions", () => {
    const ranked = prefilter(facts, splitSections(specDoc));
    expect(ranked[0]!.section.id).toBe("retry-policy");
    expect(ranked.map((r) => r.section.id)).toContain("_intro"); // mentions PAY-12
    expect(ranked.map((r) => r.section.id)).not.toContain("refunds");
  });
});

describe("resolveLinkedContent", () => {
  it("merges by id, ranks by priority and survives a failing resolver", async () => {
    const links: Resolver<string> = {
      name: "links",
      priority: 0,
      resolve: async () => [{ id: "1", kind: "confluence:page", title: "Spec" }],
    };
    const search: Resolver<string> = {
      name: "cql",
      priority: 1,
      resolve: async () => [
        { id: "2", kind: "confluence:page" },
        { id: "1", kind: "confluence:page", url: "https://x/1" },
      ],
    };
    const broken: Resolver<string> = { name: "graph", priority: 2, resolve: async () => Promise.reject(new Error("403")) };

    const { refs, errors } = await resolveLinkedContent("PAY-12", [search, broken, links]);
    expect(refs.map((r) => r.id)).toEqual(["1", "2"]);
    expect(refs[0]).toMatchObject({ via: ["links", "cql"], rank: 0, url: "https://x/1" });
    expect(errors.map((e) => e.resolver)).toEqual(["graph"]);
  });
});

describe("parseFindings", () => {
  it("parses fenced JSON, clamps confidence and drops unknown ids", () => {
    const raw =
      'Here you go:\n```json\n{"findings":[{"sectionId":"retry-policy","status":"outdated","reason":"AC changed","confidence":1.4,"suggestedText":"Not retried."},{"sectionId":"ghost","status":"ok","reason":"","confidence":0.9}]}\n```';
    const parsed = parseFindings(raw, ["retry-policy"]);
    expect(parsed).toEqual([
      {
        sectionId: "retry-policy",
        status: "outdated",
        reason: "AC changed",
        evidence: [],
        confidence: 1,
        suggestedText: "Not retried.",
      },
    ]);
  });

  it("accepts a bare array and unknown status becomes uncertain", () => {
    const parsed = parseFindings('[{"sectionId":"a","status":"weird","reason":"r","confidence":"x"}]');
    expect(parsed[0]).toMatchObject({ status: "uncertain", confidence: 0.5 });
  });

  it("throws when there is no JSON", () => {
    expect(() => parseFindings("sorry, I can't")).toThrow(/No JSON/);
  });
});

describe("checkClaims", () => {
  const sections = splitSections(specDoc);

  it("batches sections, keeps document order and isolates failed batches", async () => {
    const prompts: string[] = [];
    const llm = {
      async complete(prompt: string) {
        prompts.push(prompt);
        if (prompt.includes("refunds")) throw new Error("timeout");
        const ids = [...prompt.matchAll(/id=(\S+)/g)].map((m) => m[1]);
        return JSON.stringify({
          findings: ids.map((id) => ({ sectionId: id, status: id === "retry-policy" ? "outdated" : "ok", reason: "", confidence: 0.9 })),
        });
      },
    };
    const { findings, failures } = await checkClaims({
      facts,
      sections,
      llm,
      buildPrompt: (_f, batch) => batch.map((s) => `id=${s.id}`).join("\n"),
      batchSize: 2,
      concurrency: 2,
    });

    expect(prompts).toHaveLength(2);
    expect(findings.map((f) => f.sectionId)).toEqual(["_intro", "retry-policy"]);
    expect(failures).toHaveLength(1);
    expect(failures[0]!.sectionIds).toEqual(["refunds", "retry-policy-2"]);
    expect(actionable(findings).map((f) => f.sectionId)).toEqual(["retry-policy"]);
  });
});
