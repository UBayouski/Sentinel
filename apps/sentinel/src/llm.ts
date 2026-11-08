import { chat, list } from "@forge/llm";
import type { LlmAdapter } from "context-diff";

let modelPromise: Promise<string> | undefined;

/** Newest first: compares the version numbers in ids like "claude-sonnet-4-5-20250929" or "claude-sonnet-5". */
function byNewest(a: string, b: string): number {
  const nums = (id: string) => (id.replace(/-\d{8}$/, "").match(/\d+/g) ?? []).map(Number);
  const [x, y] = [nums(a), nums(b)];
  for (let i = 0; i < Math.max(x.length, y.length); i++) {
    const d = (y[i] ?? 0) - (x[i] ?? 0);
    if (d !== 0) return d;
  }
  return 0;
}

/** Pick a model at runtime (newest Sonnet by default) so we don't hard-code ids that Forge may retire. */
function pickModel(): Promise<string> {
  modelPromise ??= (async () => {
    const preferred = process.env.SENTINEL_MODEL;
    const { models } = await list();
    const active = models.filter((m) => (m as { status?: string }).status !== "deprecated").map((m) => m.model);
    const sonnets = active.filter((m) => m.includes("sonnet")).sort(byNewest);
    const model = (preferred && active.includes(preferred) ? preferred : undefined) ?? sonnets[0] ?? active[0];
    if (!model) throw new Error("No Forge LLM models available");
    console.log(`[llm] models: ${active.join(", ")} → using ${model}`);
    return model;
  })().catch((e) => {
    modelPromise = undefined; // retry on the next call
    throw e;
  });
  return modelPromise;
}

/** context-diff LlmAdapter backed by Forge LLMs (data stays on Atlassian). */
export const forgeLlm: LlmAdapter = {
  async complete(prompt: string) {
    const model = await pickModel();
    const res = await chat({
      model,
      // No temperature: newer models (e.g. claude-sonnet-5) reject it.
      max_completion_tokens: 4000,
      messages: [{ role: "user", content: prompt }],
    });
    const content = res.choices[0]?.message.content;
    if (typeof content === "string") return content;
    return (content ?? []).map((part) => part.text).join("");
  },
};
