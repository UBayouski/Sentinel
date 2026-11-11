import React, { useCallback, useEffect, useState } from "react";
import ForgeReconciler, { Button, Inline, Link, Lozenge, SectionMessage, Spinner, Stack, Text } from "@forge/react";
import { call } from "./api";
import type { PageCheck } from "../types";

/** Jira issue panel: which docs this issue affected, and their status. */
function App() {
  const [checks, setChecks] = useState<PageCheck[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await call("getIssueDocs");
      setChecks(res.checks);
      setError(res.error ?? null);
    } catch {
      setError("Couldn't load affected docs. Try again in a moment.");
      setChecks((c) => c ?? []);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  if (!checks) return <Spinner label="Loading affected docs" />;

  const refresh = (
    <Inline>
      <Button appearance="subtle" spacing="compact" isDisabled={loading} onClick={() => void load()}>
        {loading ? "Refreshing…" : "Refresh"}
      </Button>
    </Inline>
  );

  if (error) {
    return (
      <Stack space="space.100">
        <SectionMessage appearance="warning">
          <Text>{error}</Text>
        </SectionMessage>
        {refresh}
      </Stack>
    );
  }

  if (checks.length === 0) {
    return (
      <Stack space="space.100">
        <SectionMessage appearance="information">
          <Text>
            No docs checked for this issue yet. When it changes, Sentinel checks Confluence pages linked to it or
            mentioning its key.
          </Text>
        </SectionMessage>
        {refresh}
      </Stack>
    );
  }

  const outdated = checks.reduce((n, c) => n + c.findings.length, 0);

  return (
    <Stack space="space.150">
      <Text color="color.text.subtle">
        {outdated
          ? `${outdated} section${outdated === 1 ? "" : "s"} may be outdated across ${checks.length} page${checks.length === 1 ? "" : "s"}. Open a page to review the fixes.`
          : checks.length === 1
            ? "The checked page is up to date."
            : `All ${checks.length} checked pages are up to date.`}
      </Text>
      {checks.map((c) => (
        <Stack key={c.pageId} space="space.025">
          <Inline space="space.100" alignBlock="center">
            {c.pageUrl ? <Link href={c.pageUrl}>{c.pageTitle}</Link> : <Text>{c.pageTitle}</Text>}
            {c.findings.length > 0 ? (
              <Lozenge appearance="moved">{c.findings.length} outdated</Lozenge>
            ) : (
              <Lozenge appearance="success">Up to date</Lozenge>
            )}
          </Inline>
          {c.findings.length > 0 && (
            <Text size="small" color="color.text.subtle">
              {c.findings.map((f) => f.heading ?? "Intro").join(" · ")}
            </Text>
          )}
          <Text size="small" color="color.text.subtlest">
            Checked {timeAgo(c.checkedAt)}
          </Text>
        </Stack>
      ))}
      {refresh}
    </Stack>
  );
}

function timeAgo(iso: string): string {
  const s = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.round(s / 60)} min ago`;
  if (s < 86400) return `${Math.round(s / 3600)} h ago`;
  return new Date(iso).toLocaleDateString();
}

ForgeReconciler.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
