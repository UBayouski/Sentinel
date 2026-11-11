// Registers Sentinel's two Teamwork Graph queries (issue → pages, pages → issue) for the app.
//
// The endpoint only accepts a logged-in browser session (API tokens are rejected), so:
//   1. Open https://<your-site>.atlassian.net in the browser, logged in as an app contributor.
//   2. Open DevTools → Console (F12). Chrome may ask you to type "allow pasting" first.
//   3. Paste this whole file and press Enter.
// It prints the `forge variables set` command to run next. Re-running is safe: identical
// queries return the existing keys.

(async () => {
  const appId = "ari:cloud:ecosystem::app/4984e5e6-fa64-4fe2-9a1b-2634ff2c3c4e";
  const paramsSchema = [{ name: "issueAri", type: "ARI", required: true }];
  const queries = {
    "sentinel-issue-links-pages":
      "MATCH (w:JiraWorkItem {ari: $issueAri})-[:content_entity_links_entity]->(p:ConfluencePage) RETURN p",
    "sentinel-pages-link-issue":
      "MATCH (p:ConfluencePage)-[:content_entity_links_entity]->(w:JiraWorkItem {ari: $issueAri}) RETURN p",
  };

  const keys = [];
  for (const [name, cypher] of Object.entries(queries)) {
    const res = await fetch("/gateway/api/twg/cypher-queries", {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({ appId, name, cypher, paramsSchema }),
    });
    const body = await res.json().catch(() => null);
    console.log(`${name}: HTTP ${res.status}`, body);
    if (body?.queryKey) keys.push(body.queryKey);
  }

  if (keys.length) {
    console.log(`\nNext, in apps/sentinel:\n  forge variables set -e development TWG_ISSUE_PAGES_QUERY ${keys.join(",")}\n  forge deploy -e development`);
  } else {
    console.warn("No query keys came back. Copy the output above and share it.");
  }
})();
