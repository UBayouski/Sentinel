import { describe, expect, it } from "vitest";
import { extractText, patchSection, splitSections, textToAdf } from "../src/adf.js";
import { specDoc } from "./fixtures.js";

describe("splitSections", () => {
  const sections = splitSections(specDoc);

  it("creates intro + heading sections with stable, unique ids", () => {
    expect(sections.map((s) => s.id)).toEqual(["_intro", "retry-policy", "refunds", "retry-policy-2"]);
  });

  it("keeps deeper headings inside their parent section", () => {
    const refunds = sections.find((s) => s.id === "refunds")!;
    expect(refunds.text).toContain("Refund webhooks fire once.");
  });

  it("extracts body text without the heading", () => {
    const retry = sections[1]!;
    expect(retry.heading).toBe("Retry policy");
    expect(retry.text).toContain("retried 3 times");
    expect(retry.text).toContain("First retry after 1 minute");
    expect(retry.text).not.toContain("Retry policy");
  });

  it("flags sections that patching would flatten", () => {
    expect(sections.find((s) => s.id === "retry-policy")!.complex).toBe(false);
    expect(sections.find((s) => s.id === "refunds")!.complex).toBe(true);
  });

  it("handles a doc with no headings", () => {
    const doc = { type: "doc" as const, content: [{ type: "paragraph", content: [{ type: "text", text: "hi" }] }] };
    expect(splitSections(doc)).toHaveLength(1);
    expect(splitSections({ type: "doc", content: [] })).toEqual([]);
  });
});

describe("textToAdf", () => {
  it("builds paragraphs and lists", () => {
    const nodes = textToAdf("No automatic retries.\n\n- Customer retries manually\n- Alert after failure\n\n1. One\n2. Two");
    expect(nodes.map((n) => n.type)).toEqual(["paragraph", "bulletList", "orderedList"]);
    expect(nodes[1]!.content).toHaveLength(2);
  });
});

describe("patchSection", () => {
  it("replaces only the target section body and keeps the heading", () => {
    const patched = patchSection(specDoc, "retry-policy", "Failed card payments are not retried automatically.");
    const after = splitSections(patched);
    expect(after.map((s) => s.id)).toEqual(["_intro", "retry-policy", "refunds", "retry-policy-2"]);
    expect(after[1]!.text).toBe("Failed card payments are not retried automatically.");
    expect(after[2]!.text).toContain("Full refund");
    expect(after[3]!.text).toBe("Duplicate heading on purpose.");
  });

  it("does not mutate the input", () => {
    const before = JSON.stringify(specDoc);
    patchSection(specDoc, "refunds", "x");
    expect(JSON.stringify(specDoc)).toBe(before);
  });

  it("can patch the intro", () => {
    const patched = patchSection(specDoc, "_intro", "New owner: Billing.");
    expect(extractText(patched.content[0]!)).toBe("New owner: Billing.");
  });

  it("throws for unknown sections", () => {
    expect(() => patchSection(specDoc, "nope", "x")).toThrow(/not found/);
  });
});
