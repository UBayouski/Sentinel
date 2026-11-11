# Sentinel workspace

Codegeist 2026 entry **Stale Doc Sentinel**. Its open-source core library, [`context-diff`](https://www.npmjs.com/package/context-diff), lives in its own repo.

| Path | What | Visibility |
|---|---|---|
| [`context-diff`](https://github.com/UBayouski/context-diff) (npm dependency) | Generic engine: ADF sections, change facts, prefilter, resolvers, LLM check runner | **Public** (Apache-2.0), own repo |
| `apps/sentinel` | Forge app: Jira trigger, async worker, Forge LLM adapter, private prompt, storage, UI | Private |

Design doc: `../hackathon/codegeist-2026/sentinel-design.md`

## How it works

```
Jira issue updated → trigger (filter doc-relevant fields) → queue "doc-checks"
  → worker: find pages (remote links, CQL mentions) → split sections → prefilter → Forge LLM check
  → store findings (Confluence page property "sentinel-findings") → page banner + byline popup (Apply / Edit / Dismiss) + Jira issue panel

Rovo agent "Doc Steward" → actions: find-stale-docs (GET), check-docs-now (TRIGGER), apply-doc-fix / dismiss-doc-finding (UPDATE, Rovo asks the user to confirm)
```

Storage: Forge KVS is **per installation** (Jira and Confluence installs don't share it), so findings live on the page as a content property that both can read. Jira's KVS only keeps an issue → pages index for the issue panel.

The worker reads as the app. Users only see pages they can view, and fixes are written **as the user**, with a check that the section hasn't changed since it was analysed.

## Commands

```sh
pnpm install
pnpm test          # app unit tests
pnpm typecheck
```

## Run the app on a dev site

1. Get a free developer site: http://go.atlassian.com/cloud-dev
2. `npm install -g @forge/cli`, then `forge login` (needs an Atlassian API token)
3. `pnpm install`
4. `cd apps/sentinel && forge register --developer-space-id <id>` (done: app registered in Developer Space "IoT Forge")
5. `forge lint`. It validates module and scope names. Fix whatever it flags first.
6. `forge deploy && forge install` (pick Jira and Confluence on the same site)
7. Demo data: fill in `.env` (see `.env.example`), then
   - `node scripts/seed.mjs`: creates project PAY, space PAYDOCS, a spec page and an issue linked to it (safe to re-run)
   - `node scripts/seed.mjs --change`: edits the issue's acceptance criteria, which triggers Sentinel
   - open the page → **Doc freshness** in the byline. `--reset` restores the original text to replay the demo
8. Logs: `forge logs` (or `forge tunnel` for live local runs)
9. Rovo: free developer sites may not show Rovo chat. A Forge demo site works around it: `forge site provision`, then `forge install --demo-site -p jira` (and `-p confluence`), then `ATLASSIAN_SITE=<demo>.atlassian.net node scripts/seed.mjs` (seed state is kept per site). Current demo site: one-atlas-nhfp.atlassian.net (expires 2027-02-06)

## Week-1 spikes (still open)

- [x] `forge lint` passes (2026-11-08): `llm` module shape, consumer `function:` form, granular scope names, runtime `nodejs22.x`
- [x] Forge bundles the pnpm-workspace `context-diff` package (deployed 2026-11-08). App relative imports must be extensionless, and tsconfig must not set `noEmit` (Forge ts-loader uses it)
- [x] Forge LLMs available (2026-11-08): Claude models incl. `claude-sonnet-5` (default pick). Newer models reject `temperature`
- [x] Jira `avi:jira:updated:issue` payload includes `changelog.items`; both resolvers find the linked page (2026-11-08)
- [x] Byline popup shows findings stored by the Jira-side worker (2026-11-08, after moving storage to a page property)
- [x] Apply as the user (2026-11-08): new page version authored by the user, only the target section changes, finding removed
- [x] Dismiss (2026-11-08): removes the finding, page untouched
- [x] Jira issue panel (2026-11-08): open it once via the Apps button under the issue title; reads findings from the page property
- [x] Doc Steward Rovo agent (2026-11-08, demo site): find-stale-docs and apply-doc-fix work from Rovo chat, with Rovo's confirm step
- [x] Confluence page banner (2026-11-08): shows "N sections may be outdated after PAY-1" + section names + Review button; hidden when the page is fine
- [x] Admin settings (2026-11-08): Jira admin page (projects, fields incl. custom, spaces, max pages, confidence, uncertain); trigger and worker read it from Jira storage
- [x] Review UI (2026-11-08): Apply all, struck-through current text, issue panel refresh + last-checked time
- [x] Teamwork Graph finder: both persisted queries registered (issue → page, page → issue) and set. Returns the demo page for PAY-1 (2026-11-10, `via teamwork-graph` in the logs)

## The open-source library

`context-diff` has its own repo (`../context-diff` → github.com/UBayouski/context-diff, with CI) and is published on npm. The app depends on it as `"context-diff": "^0.1.0"`. To change the library: edit it in its repo, bump the version, `npm publish`, then update the version here.

## Teamwork Graph finder (one-time setup)

New apps can't send raw Cypher, so the issue ↔ page queries (both link directions) are registered once as persisted queries. Registration only accepts a logged-in browser session (API tokens are rejected), and you must be a contributor on the app.

1. Open your site (https://<site>.atlassian.net) in the browser, then DevTools → Console.
2. Paste `scripts/register-twg-queries.js` and press Enter. It registers both queries for this app and prints the next command.
3. Run the printed command, then redeploy:
   ```sh
   cd apps/sentinel
   forge variables set -e development TWG_ISSUE_PAGES_QUERY <key1>,<key2>
   forge deploy -e development
   ```
   New keys take about a minute to become usable (until then the graph answers `QUERY_NOT_FOUND`).

Notes: the graph API is Preview and works only as a user, so the finder runs from the Rovo agent (`find-stale-docs`, `check-docs-now`), and pages it finds are passed to the worker in the check job. Scopes: `read:graph:issue:jira`, `read:graph:page:confluence`. Failures often return HTTP 200 with `errors`; the finder treats those as errors and the other finders still run.
