import React, { useEffect, useState } from "react";
import ForgeReconciler, { Inline, Link, Lozenge, SectionMessage, Spinner, Stack, Text } from "@forge/react";
import { call } from "./api";
import type { PageCheck } from "../types";

/** Jira issue panel: which docs this issue affected, and their status. */
function App() {
  const [checks, setChecks] = useState<PageCheck[] | null>(null);

  useEffect(() => {
    void call("getIssueDocs").then((r) => setChecks(r.checks));
  }, []);

  if (!checks) return <Spinner label="Loading affected docs" />;
  if (checks.length === 0) {
    return (
      <SectionMessage appearance="information">
        <Text>No linked docs checked yet. Sentinel checks pages linked to or mentioning this issue when it changes.</Text>
      </SectionMessage>
    );
  }

  return (
    <Stack space="space.100">
      {checks.map((c) => (
        <Inline key={c.pageId} space="space.100" alignBlock="center">
          {c.pageUrl ? <Link href={c.pageUrl}>{c.pageTitle}</Link> : <Text>{c.pageTitle}</Text>}
          {c.findings.length > 0 ? (
            <Lozenge appearance="moved">{c.findings.length} outdated</Lozenge>
          ) : (
            <Lozenge appearance="success">Up to date</Lozenge>
          )}
        </Inline>
      ))}
    </Stack>
  );
}

ForgeReconciler.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
