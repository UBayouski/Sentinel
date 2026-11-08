# context-diff

Detect when a change makes parts of a document outdated.

`context-diff` is the provider-agnostic core behind change-aware documentation tools. Given *what changed* (for example a Jira issue edit) and *a document* (Atlassian Document Format), it finds the sections the change is likely about and checks them with the LLM of your choice. It returns structured findings with suggested replacement text.

- **Section-level ADF tools:** split a document by headings with stable ids, extract text, patch one section without touching the rest.
- **Change normalization:** Jira changelog items → `ChangeFact[]`, with noise and no-op changes dropped.
- **Cheap prefilter:** score sections by overlap with the change, before spending LLM tokens.
- **Resolver merging:** combine several "where could related content be?" sources and rank the results.
- **LLM check runner:** batching, concurrency, tolerant JSON parsing, per-batch failure isolation. **You** supply the prompt and the model.

No runtime dependencies. No network calls. All I/O goes through what you pass in, so it runs in Atlassian Forge, Node, or the browser.

## Install

```sh
npm install context-diff
```

## Example

```ts
import {
  normalizeJiraChangelog, splitSections, prefilter, checkClaims, actionable, patchSection,
  FINDINGS_JSON_SCHEMA, type LlmAdapter,
} from "context-diff";

const facts = normalizeJiraChangelog("PAY-12", changelog.items);
const sections = splitSections(pageAdf);
const candidates = prefilter(facts, sections).map((s) => s.section);

const llm: LlmAdapter = { complete: (prompt) => myModel(prompt) };
const { findings } = await checkClaims({
  facts,
  sections: candidates,
  llm,
  buildPrompt: (facts, sections) => myPrompt(facts, sections, FINDINGS_JSON_SCHEMA),
});

for (const f of actionable(findings)) {
  if (f.suggestedText) pageAdf = patchSection(pageAdf, f.sectionId, f.suggestedText);
}
```

## API

| Function | Purpose |
|---|---|
| `splitSections(doc, { maxLevel })` | Heading-delimited sections: `id`, `heading`, `text`, `range`, `complex` |
| `patchSection(doc, id, text)` | New doc with that section's body replaced (heading kept). Check `complex` first: tables/panels get flattened |
| `extractText(node)`, `textToAdf(text)` | ADF ↔ plain text (paragraphs, `- ` bullets, `1. ` lists) |
| `normalizeJiraChangelog(key, items, opts)` | Jira changelog → `ChangeFact[]` (`include`, `exclude`, `"*"`) |
| `prefilter(facts, sections, { minScore, limit })` | Ranked candidate sections with matched terms |
| `resolveLinkedContent(input, resolvers)` | Run resolvers in parallel, merge by id, collect errors |
| `checkClaims({ facts, sections, llm, buildPrompt })` | Batched LLM checks → `{ findings, failures }` |
| `parseFindings(raw, ids)` / `actionable(findings)` | Parse LLM JSON output / keep confident "outdated" findings |
| `FINDINGS_JSON_SCHEMA` | The output schema to put in your prompt |

## License

Apache-2.0
