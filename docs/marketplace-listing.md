# Marketplace listing draft

Lengths are checked by `node scripts/check-listing.mjs`. Limits come from Atlassian's listing guidelines.

## Name (≤60, no "app", "plugin" or "Atlassian")
Stale Doc Sentinel for Confluence

## Tagline (≤130)
Catch Confluence docs that Jira changes made wrong, see exactly which sections and why, and fix them in one click.

## Summary (no documented limit; keep it short)
When acceptance criteria or other key fields change in Jira, Sentinel checks the linked and mentioning Confluence pages, flags only the sections that now contradict the issue, and suggests a fix you can apply, edit or dismiss.

## Highlight 1
- Title (≤50): Know which docs a Jira change broke
- Summary (≤220): Change an issue and Sentinel checks every linked or mentioning page. A banner names the outdated sections and the issue that changed them, and sections that still agree are left alone.
- Screenshot: page banner + byline popup with findings (1840×900); cropped 580×330

## Highlight 2
- Title (≤50): Fix in one click, safely
- Summary (≤220): Apply a suggested fix and only that section changes, as a new page version under your name. If someone edited the section since the check, Sentinel refuses to overwrite it.
- Screenshot: finding card with Apply / Edit / Dismiss, then page history (1840×900)

## Highlight 3
- Title (≤50): Ask Doc Steward in Rovo or any MCP client
- Summary (≤220): "Which docs are stale because of PAY-1?" The Doc Steward agent lists them and applies fixes after you confirm. The same tools work from Claude, Cursor and other MCP clients.
- Screenshot: Rovo chat with Doc Steward (1840×900)

## More details (body)
Teams change requirements in Jira every day, and the Confluence spec quietly goes stale. Sentinel closes that gap:

- **Watches Jira:** reacts to changes in documentation-relevant fields.
- **Finds the right pages:** pages linked from the issue, pages that mention its key, and Teamwork Graph links.
- **Checks section by section:** only sections that contradict the change are flagged, each with a reason and a suggested rewrite.
- **Fixes as you:** Apply, Edit or Dismiss from a page banner, the byline, the Jira issue panel, Rovo chat or MCP.
- **Runs on Atlassian:** Forge and Forge LLM only, nothing leaves Atlassian, and findings follow Confluence page permissions.

## Assets to produce
| Asset | Size |
|---|---|
| Logo | 144×144 PNG |
| Banner | 1120×548 |
| 3 highlight screenshots | 1840×900, plus 580×330 crops |

## Links
- Documentation: docs/judges.md (publish as a public page, e.g. GitHub Pages)
- Privacy policy: docs/privacy.md (fill in publisher name and contact, publish publicly)
- Support: a GitHub issues link or a support email

## Open question (see support ticket)
A free listing may not be possible for an app that needs both Jira and Confluence. The name and copy above assume a Confluence-primary listing; adjust after Atlassian answers.
