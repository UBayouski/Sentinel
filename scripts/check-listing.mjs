#!/usr/bin/env node
// Checks Marketplace listing copy in docs/marketplace-listing.md against length limits.
import { readFileSync } from "node:fs";

const md = readFileSync(new URL("../docs/marketplace-listing.md", import.meta.url), "utf8");
const section = (title) => md.split(/^## /m).find((s) => s.startsWith(title))?.split("\n").slice(1).join("\n").trim() ?? "";
const checks = [
  ["Name", section("Name").split("\n")[0], 60],
  ["Tagline", section("Tagline"), 130],
];
for (const n of [1, 2, 3]) {
  const h = section(`Highlight ${n}`);
  checks.push([`Highlight ${n} title`, /Title \(≤50\): (.*)/.exec(h)?.[1] ?? "", 50]);
  checks.push([`Highlight ${n} summary`, /Summary \(≤220\): (.*)/.exec(h)?.[1] ?? "", 220]);
}
let bad = 0;
for (const [label, text, max] of checks) {
  const ok = text.length > 0 && text.length <= max;
  if (!ok) bad++;
  console.log(`${ok ? "ok  " : "FAIL"} ${label}: ${text.length}/${max}`);
}
if (/\b(app|plugin|atlassian)\b/i.test(checks[0][1])) { bad++; console.log("FAIL Name contains a banned word"); }
process.exit(bad ? 1 : 0);
