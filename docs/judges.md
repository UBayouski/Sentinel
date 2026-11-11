# Stale Doc Sentinel: setup and test guide for judges

Stale Doc Sentinel notices when a Jira change makes Confluence docs wrong, shows which sections are outdated and why, and fixes them in one click (or through the **Doc Steward** Rovo agent, or any MCP client).

About 5 minutes. No code, no API tokens.

## What you need

- An Atlassian Cloud site with **Jira and Confluence** (any plan, including a free developer site).
- **Rovo** enabled on that site to try the Doc Steward agent. Free developer sites often don't show Rovo; a Forge demo site does (`forge site provision`). Everything else works without Rovo.
- Site admin rights to install the app (the Teamwork Graph permission may need an org admin).

## 1. Install

1. Open the **[install link](https://developer.atlassian.com/console/install/4984e5e6-fa64-4fe2-9a1b-2634ff2c3c4e?signature=AYABeE7xUzBdrrmcSHU8wBajOxQAAAADAAdhd3Mta21zAEthcm46YXdzOmttczp1cy13ZXN0LTI6NzA5NTg3ODM1MjQzOmtleS83MDVlZDY3MC1mNTdjLTQxYjUtOWY5Yi1lM2YyZGNjMTQ2ZTcAuAECAQB4CxqLTo9l4lqXuFjNim1xJM%2Bp%2F3TVP9xHS2BrU5DRRucBL6%2BHB6IcT2W5B6PYJtfwSgAAAH4wfAYJKoZIhvcNAQcGoG8wbQIBADBoBgkqhkiG9w0BBwEwHgYJYIZIAWUDBAEuMBEEDFYEFTpntWYOhX%2BLDwIBEIA7t7oDfDaRrRCxVKZubC4B7RA97rAkfVk%2FnBHm30DkUpGgmZO5LjiMRcEQKdQr%2F8NGA4JfBbz7veBJfCoAB2F3cy1rbXMAS2Fybjphd3M6a21zOmV1LXdlc3QtMTo3MDk1ODc4MzUyNDM6a2V5LzQ2MzBjZTZiLTAwYzMtNGRlMi04NzdiLTYyN2UyMDYwZTVjYwC4AQICAHi9bVMAkme4qVQX1fQHo6ePw3H40A7cGfz7yrmSfBWMXgFFUfSUfE0TtKWq%2BEgaVIIXAAAAfjB8BgkqhkiG9w0BBwagbzBtAgEAMGgGCSqGSIb3DQEHATAeBglghkgBZQMEAS4wEQQMA8HAfzMzNyXQzYniAgEQgDsRW2ABoyiQYKniXglzhfW9UWoWrX6FhadL5gn6JMbPYOXHZa7oZ%2B4S0cAL2Sns33x%2F8xHUQye65iXv8wAHYXdzLWttcwBLYXJuOmF3czprbXM6dXMtZWFzdC0xOjcwOTU4NzgzNTI0MzprZXkvNmMxMjBiYTAtNGNkNS00OTg1LWI4MmUtNDBhMDQ5NTJjYzU3ALgBAgIAeDYASx0XCjkny4iLV6vz%2BKtEGSGT6kdt0QRpkn6D%2FlVEAbS4b6dRAYV%2FLK6Q23vA0jsAAAB%2BMHwGCSqGSIb3DQEHBqBvMG0CAQAwaAYJKoZIhvcNAQcBMB4GCWCGSAFlAwQBLjARBAxHOKip3ek9xrrZpT8CARCAO%2FH4QqO82%2FBmgzDOvCFDwMa2qz3D%2Bz473b85tV%2FO%2BOLZBDWbyywsCEuX2XEQqNiU3VnmEBFasYJJBAE8AgAAAAAMAAAQAAAAAAAAAAAAAAAAAD0elbbLa9WhPcgmgqss%2Bd7%2F%2F%2F%2F%2FAAAAAQAAAAAAAAAAAAAAAQAAADL%2FZXqd%2Bd%2Fg4CW80PFh5PZnoKPnldy%2FR9Ixvo1C%2Br3qkjefgrX6zS77hLmSoQSPezyrXfj0ssOGvv8xFWREIr2RDCk%3D&product=jira&product=confluence)** (also in the submission form).
2. Choose your site and approve. The link installs Sentinel in both **Jira** and **Confluence**; it needs both, because it watches Jira and edits Confluence. If the page only offers one product, open the link again to add the other.

## 2. Create the demo content (2 minutes)

1. **Jira:** create an issue in any project, for example
   - Summary: `Change failed-payment retry behaviour`
   - Description: `Acceptance criteria: failed card payments are retried 3 times with exponential backoff (1 min, 10 min, 1 hour).`

   Note its key, e.g. `PAY-1`.
2. **Confluence:** create a page called `Payments: Retry & Refund Spec` and paste the text below. Replace `PAY-1` with your issue key.

   ```
   Owner: Payments team. Tracks PAY-1. Last reviewed in Q3.

   ## Overview
   This page describes how the payments service handles failed card payments and refunds.

   ## Retry policy
   Failed card payments are retried automatically 3 times with exponential backoff.
   - First retry after 1 minute
   - Second retry after 10 minutes
   - Last retry after 1 hour
   The customer is not notified until all retries have failed.

   ## Customer notifications
   After the final failed retry, the customer receives an email asking them to update their card.

   ## Refunds
   Full refunds are available within 30 days. Partial refunds require a support ticket.

   ## Monitoring
   Support is alerted when the daily failure rate exceeds 5%.
   ```
   (Type `## ` at the start of a line to make a heading.) Publish the page.
3. Optional: in the Jira issue, link the page (**Link** → Confluence page). Sentinel also finds pages that just mention the issue key, so this isn't required.

## 3. Make a change and watch Sentinel react

1. Edit the Jira issue description to:
   `Acceptance criteria: failed card payments are NOT retried automatically. The customer gets an email with a link to retry manually. Support is alerted after the first failure.`
2. Wait about a minute, then open the Confluence page.

You should see:

- **A banner** at the top: "3 sections may be outdated after PAY-1", listing *Retry policy*, *Customer notifications* and *Monitoring*. Overview and Refunds are correctly left alone.
- **Review suggested fixes** (or **Doc freshness** under the title): for each section, why it is outdated, the current text (struck through) and a suggested replacement, with **Apply**, **Edit** and **Dismiss**, plus **Apply all** for plain-text sections.
- **Apply** creates a new page version under your name and changes only that section. If someone edited the section after the check, Sentinel refuses to overwrite it.
- **In Jira**, the issue's **Apps** button (under the title) → **Docs affected by this issue** lists the page and its status.

## 4. Doc Steward (Rovo agent)

Open the Jira issue, click **Ask Rovo** → pick **Doc Steward** and try:

- "Which docs are stale because of this issue?"
- "Apply the retry policy fix." (Rovo asks you to confirm before anything changes.)
- "Check the docs for PAY-1 again."

## 5. MCP tools

The same four actions are published as MCP tools: `find-stale-docs`, `check-docs-now`, `apply-doc-fix`, `dismiss-doc-finding`. Requires Rovo on the site.

1. **Expose the tools** (off by default): admin.atlassian.com → **Apps** → **Sites** → your site → **Connected apps** → **Stale Doc Sentinel** → **View app details** → **Tools**, tick all four and save.
2. **Connect a client.** With Claude Code:
   ```sh
   claude mcp add --transport http sentinel https://mcp.atlassian.com/forge/4984e5e6-fa64-4fe2-9a1b-2634ff2c3c4e
   ```
   then run `/mcp` inside Claude Code, sign in, pick your site and approve.
3. Ask: "Which Confluence docs are outdated because of PAY-1?" then "Apply the fix for the Monitoring section."

MCP calls have no "current issue", so name the issue key. Changes are made as you, with the same safety check as the page UI.

## 6. Settings (Jira admins)

Jira **Settings** (gear, top right) → in the **Switch settings** dropdown pick **Marketplace apps** → **Stale Doc Sentinel** under **Apps** in the sidebar:

- turn automatic checks on or off;
- choose projects, and which fields trigger a check (including custom fields such as "Business rules");
- limit checks to certain Confluence spaces and cap pages per change;
- set the confidence threshold and whether to show "maybe outdated" sections.

## Replay the demo

Change the issue description back to the original text: Sentinel re-checks and the page is reported up to date, which shows it doesn't flag sections that still agree with Jira. To see findings again, restore the page's original text from page history and repeat step 3.

## Privacy and permissions

- Runs entirely on Atlassian (Forge, Forge LLM): no data leaves Atlassian. Eligible for Runs on Atlassian.
- Users only see findings for pages they can view. Fixes are written as the user, never as the app.
- Findings are stored on the page itself (a page property), so they follow Confluence permissions.
