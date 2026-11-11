#!/usr/bin/env node
// Seed demo data for Sentinel, or trigger the demo change.
//
//   node scripts/seed.mjs            create project, space, spec page, issue, link (idempotent)
//   node scripts/seed.mjs --change   edit the issue's description so Sentinel runs
//   node scripts/seed.mjs --reset    restore the original description (to replay the demo)
//
// Reads ATLASSIAN_SITE, ATLASSIAN_EMAIL, ATLASSIAN_API_TOKEN (and optional SEED_PROJECT, SEED_SPACE) from .env.
// Environment variables win, e.g. ATLASSIAN_SITE=other.atlassian.net node scripts/seed.mjs

import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "..");
loadEnv(join(root, ".env"));

const SITE = required("ATLASSIAN_SITE").replace(/^https?:\/\//, "").replace(/\/$/, "");
const AUTH = "Basic " + Buffer.from(`${required("ATLASSIAN_EMAIL")}:${required("ATLASSIAN_API_TOKEN")}`).toString("base64");
const PROJECT = process.env.SEED_PROJECT ?? "PAY";
const SPACE = process.env.SEED_SPACE ?? "PAYDOCS";
// One state file per site, so the demo can be seeded on several sites (ATLASSIAN_SITE=... overrides .env).
const STATE_FILE = join(here, `.seed-state.${SITE}.json`);
const state = existsSync(STATE_FILE) ? JSON.parse(readFileSync(STATE_FILE, "utf8")) : {};
const save = () => writeFileSync(STATE_FILE, JSON.stringify(state, null, 2));

const ORIGINAL_DESCRIPTION =
  "Acceptance criteria: failed card payments are retried 3 times with exponential backoff (1 min, 10 min, 1 hour).";
const CHANGED_DESCRIPTION =
  "Acceptance criteria: failed card payments are NOT retried automatically. The customer gets an email with a link to retry manually. Support is alerted after the first failure.";

const mode = process.argv[2] ?? "--seed";
if (mode === "--change") await setDescription(CHANGED_DESCRIPTION, "changed");
else if (mode === "--reset") await setDescription(ORIGINAL_DESCRIPTION, "reset");
else await seed();

// ---------------------------------------------------------------------------

async function seed() {
  const me = await api("GET", "/rest/api/3/myself");

  // 1. Jira project
  let project = await api("GET", `/rest/api/3/project/${PROJECT}`, undefined, { allow404: true });
  if (!project) {
    project = await api("POST", "/rest/api/3/project", {
      key: PROJECT,
      name: "Payments",
      projectTypeKey: "software",
      projectTemplateKey: "com.pyxis.greenhopper.jira:gh-simplified-kanban-classic",
      leadAccountId: me.accountId,
      assigneeType: "UNASSIGNED",
    });
    log(`created Jira project ${PROJECT}`);
  } else log(`Jira project ${PROJECT} exists`);

  // 2. Confluence space
  let space = (await api("GET", `/wiki/api/v2/spaces?keys=${SPACE}`)).results?.[0];
  if (!space) {
    await api("POST", "/wiki/rest/api/space", { key: SPACE, name: "Payments Docs" });
    space = (await api("GET", `/wiki/api/v2/spaces?keys=${SPACE}`)).results?.[0];
    log(`created Confluence space ${SPACE}`);
  } else log(`Confluence space ${SPACE} exists`);

  // 3. Issue (created first so the page can mention its key)
  if (!state.issueKey) {
    const types = await api("GET", `/rest/api/3/issue/createmeta/${PROJECT}/issuetypes`);
    const list = types.issueTypes ?? types.values ?? [];
    const type = list.find((t) => t.name === "Task") ?? list.find((t) => !t.subtask);
    const issue = await api("POST", "/rest/api/3/issue", {
      fields: {
        project: { key: PROJECT },
        issuetype: { id: type.id },
        summary: "Change failed-payment retry behaviour",
        description: adfDoc([para(ORIGINAL_DESCRIPTION)]),
      },
    });
    state.issueKey = issue.key;
    save();
    log(`created issue ${issue.key}`);
  } else log(`issue ${state.issueKey} exists`);

  // 4. Spec page
  if (!state.pageId) {
    const page = await api("POST", "/wiki/api/v2/pages", {
      spaceId: space.id,
      status: "current",
      title: "Payments: Retry & Refund Spec",
      body: { representation: "atlas_doc_format", value: JSON.stringify(specPage(state.issueKey)) },
    });
    state.pageId = page.id;
    state.pageUrl = `https://${SITE}/wiki${page._links?.webui ?? ""}`;
    save();
    log(`created page ${page.id}`);
  } else log(`page ${state.pageId} exists`);

  // 5. Link issue → page (what Sentinel's first resolver reads)
  if (!state.linked) {
    await api("POST", `/rest/api/3/issue/${state.issueKey}/remotelink`, {
      globalId: `pageId=${state.pageId}`,
      application: { type: "com.atlassian.confluence", name: "Confluence" },
      relationship: "Wiki Page",
      object: { url: state.pageUrl, title: "Payments: Retry & Refund Spec" },
    });
    state.linked = true;
    save();
    log(`linked ${state.issueKey} → page ${state.pageId}`);
  }

  console.log(`
Done.
  Issue: https://${SITE}/browse/${state.issueKey}
  Page:  ${state.pageUrl}

Next: node scripts/seed.mjs --change   (then open the page → "Doc freshness" in the byline)`);
}

async function setDescription(text, label) {
  if (!state.issueKey) throw new Error("Run the seed first.");
  await api("PUT", `/rest/api/3/issue/${state.issueKey}`, { fields: { description: adfDoc([para(text)]) } });
  log(`${label} description of ${state.issueKey}`);
  if (label === "reset" && state.pageId) {
    // Undo fixes applied during a demo, as a new page version.
    const page = await api("GET", `/wiki/api/v2/pages/${state.pageId}`);
    await api("PUT", `/wiki/api/v2/pages/${state.pageId}`, {
      id: state.pageId,
      status: "current",
      title: page.title,
      body: { representation: "atlas_doc_format", value: JSON.stringify(specPage(state.issueKey)) },
      version: { number: page.version.number + 1, message: "Demo reset" },
    });
    log(`restored page ${state.pageId} to the original spec`);
  }
  if (label === "changed") console.log(`Watch: cd apps/sentinel && forge logs -e development\nThen open: ${state.pageUrl}`);
}

// ---------------------------------------------------------------------------

function specPage(issueKey) {
  return adfDoc([
    // Plain key for text search, plus a Jira smart link: a real issue ↔ page link for Teamwork Graph.
    {
      type: "paragraph",
      content: [
        { type: "text", text: `Owner: Payments team. Tracks ${issueKey} (` },
        { type: "inlineCard", attrs: { url: `https://${SITE}/browse/${issueKey}` } },
        { type: "text", text: "). Last reviewed in Q3." },
      ],
    },
    heading(2, "Overview"),
    para("This page describes how the payments service handles failed card payments and refunds."),
    heading(2, "Retry policy"),
    para("Failed card payments are retried automatically 3 times with exponential backoff."),
    bullets(["First retry after 1 minute", "Second retry after 10 minutes", "Last retry after 1 hour"]),
    para("The customer is not notified until all retries have failed."),
    heading(2, "Customer notifications"),
    para("After the final failed retry, the customer receives an email asking them to update their card."),
    heading(2, "Refunds"),
    para("Full refunds are available within 30 days. Partial refunds require a support ticket."),
    heading(2, "Monitoring"),
    para("Support is alerted when the daily failure rate exceeds 5%."),
  ]);
}

function adfDoc(content) {
  return { type: "doc", version: 1, content };
}
function para(text) {
  return { type: "paragraph", content: [{ type: "text", text }] };
}
function heading(level, text) {
  return { type: "heading", attrs: { level }, content: [{ type: "text", text }] };
}
function bullets(items) {
  return { type: "bulletList", content: items.map((t) => ({ type: "listItem", content: [para(t)] })) };
}

async function api(method, path, body, { allow404 = false } = {}) {
  const res = await fetch(`https://${SITE}${path}`, {
    method,
    headers: { Authorization: AUTH, Accept: "application/json", ...(body ? { "Content-Type": "application/json" } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (allow404 && res.status === 404) return null;
  const text = await res.text();
  if (!res.ok) throw new Error(`${method} ${path} → ${res.status}: ${text.slice(0, 400)}`);
  return text ? JSON.parse(text) : {};
}

function loadEnv(file) {
  if (!existsSync(file)) return;
  for (const line of readFileSync(file, "utf8").split(/\r?\n/)) {
    const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/.exec(line);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
}
function required(name) {
  const v = process.env[name];
  if (!v) {
    console.error(`Missing ${name}. Copy .env.example to .env and fill it in.`);
    process.exit(1);
  }
  return v;
}
function log(msg) {
  console.log(`✔ ${msg}`);
}
