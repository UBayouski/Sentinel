# Sentinel workspace

Codegeist 2026 entry **Stale Doc Sentinel**, plus its open-source core library.

| Path | What | Visibility |
|---|---|---|
| `packages/context-diff` | Generic engine: ADF sections, change facts, prefilter, resolvers, LLM check runner | **Public** (Apache-2.0), extracted around Nov 22 |
| `apps/sentinel` | Forge app: Jira trigger, async worker, Forge LLM adapter, private prompt, storage, UI | Private |

Design doc: `../hackathon/codegeist-2026/sentinel-design.md`

## How it works

```
Jira issue updated → trigger (filter doc-relevant fields) → queue "doc-checks"
  → worker: find pages (remote links, CQL mentions) → split sections → prefilter → Forge LLM check
  → store findings (Confluence page property "sentinel-findings") → Confluence byline popup (Apply / Edit / Dismiss) + Jira issue panel
```

Storage: Forge KVS is **per installation** (Jira and Confluence installs don't share it), so findings live on the page as a content property that both can read. Jira's KVS only keeps an issue → pages index for the issue panel.

The worker reads as the app. Users only see pages they can view, and fixes are written **as the user**, with a check that the section hasn't changed since it was analysed.

## Commands

```sh
pnpm install
pnpm test          # library unit tests
pnpm typecheck     # library + app
pnpm --filter context-diff build   # build the library (the app imports dist/)
```

## Run the app on a dev site

1. Get a free developer site: http://go.atlassian.com/cloud-dev
2. `npm install -g @forge/cli`, then `forge login` (needs an Atlassian API token)
3. `pnpm --filter context-diff build`
4. `cd apps/sentinel && forge register --developer-space-id <id>` (done: app registered in Developer Space "IoT Forge")
5. `forge lint`. It validates module and scope names. Fix whatever it flags first.
6. `forge deploy && forge install` (pick Jira and Confluence on the same site)
7. Demo data: fill in `.env` (see `.env.example`), then
   - `node scripts/seed.mjs`: creates project PAY, space PAYDOCS, a spec page and an issue linked to it (safe to re-run)
   - `node scripts/seed.mjs --change`: edits the issue's acceptance criteria, which triggers Sentinel
   - open the page → **Doc freshness** in the byline. `--reset` restores the original text to replay the demo
8. Logs: `forge logs` (or `forge tunnel` for live local runs)

## Week-1 spikes (still open)

- [x] `forge lint` passes (2026-11-08): `llm` module shape, consumer `function:` form, granular scope names, runtime `nodejs22.x`
- [x] Forge bundles the pnpm-workspace `context-diff` package (deployed 2026-11-08). App relative imports must be extensionless, and tsconfig must not set `noEmit` (Forge ts-loader uses it)
- [x] Forge LLMs available (2026-11-08): Claude models incl. `claude-sonnet-5` (default pick). Newer models reject `temperature`
- [x] Jira `avi:jira:updated:issue` payload includes `changelog.items`; both resolvers find the linked page (2026-11-08)
- [x] Byline popup shows findings stored by the Jira-side worker (2026-11-08, after moving storage to a page property)
- [x] Apply as the user (2026-11-08): new page version authored by the user, only the target section changes, finding removed
- [x] Dismiss (2026-11-08): removes the finding, page untouched
- [x] Jira issue panel (2026-11-08): open it once via the Apps button under the issue title; reads findings from the page property
- [ ] A Rovo agent hello-world (next milestone: Doc Steward agent + actions)
- [ ] Teamwork Graph: `requestTeamworkGraph` exists in `@forge/api`; find the issue↔page query → becomes a third resolver
- [ ] Confluence page banner module (nicer than byline) if available

## Extracting the library (around Nov 22)

```sh
git subtree split --prefix=packages/context-diff -b context-diff-public
# push that branch to a new public repo, then publish to npm
```
The app keeps depending on `context-diff` (switch `workspace:*` to the npm version).
