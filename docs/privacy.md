# Stale Doc Sentinel privacy policy

_Last updated: November 2026. Publisher: Uladzislau Bayouski, contact: uladzislaubayouski@gmail.com._

Stale Doc Sentinel ("the app") is an Atlassian Forge app for Jira and Confluence. It runs entirely on Atlassian's Forge platform. The publisher operates no servers of its own and receives no customer data.

## What the app processes

- **Jira issues:** when an issue is updated, the changed values of documentation-relevant fields (for example summary and description), the issue key, and the parent key. On request through the Doc Steward agent or MCP tools, the issue's current summary and description.
- **Confluence pages:** the content of pages linked to the issue or mentioning its key, to find sections that disagree with the change.
- **AI processing:** relevant page sections and the issue change are sent to Atlassian's Forge LLM service to judge which sections are outdated and to suggest replacement text. This processing happens within Atlassian's platform.

## What the app stores, and where

- **Findings** (section heading, current section text, suggested text, reason, confidence, issue key, check time) are stored on the Confluence page itself as a page property. They follow that page's Confluence permissions.
- **An index** of which pages were checked for each issue (issue key and page IDs) is stored in Forge storage for your site.
- **Platform logs** kept by Atlassian contain issue keys, page IDs and titles, and section IDs, for troubleshooting.

All of this stays in Atlassian's cloud for your site, under Atlassian's data residency settings. The app makes no calls outside Atlassian, and it has no analytics or tracking.

## Access and permissions

- Users only see findings for pages they can view.
- Page changes (Apply) are made as the signed-in user, never as the app, and appear in page history under their name.
- The background check reads issues and pages as the app, to find and analyse affected pages. Only the results described above are stored.

## Retention and deletion

- Findings are removed when a fix is applied or dismissed, and replaced on the next check of the same issue and page.
- Uninstalling the app deletes its Forge storage. Page properties created by the app stay on pages until deleted. Contact us and we'll explain how to remove them with the Confluence REST API.

## Contact

Questions or requests: uladzislaubayouski@gmail.com.
