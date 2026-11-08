import React, { useCallback, useEffect, useState } from "react";
import ForgeReconciler, { Heading, SectionMessage, Spinner, Stack, Text, useProductContext } from "@forge/react";
import { call } from "./api";
import type { PageCheck } from "../types";
import { FindingCard } from "./finding-card";

/** Confluence byline popup: outdated sections on this page and their fixes. */
function App() {
  const context = useProductContext();
  const [checks, setChecks] = useState<PageCheck[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await call("getPageFindings");
      setError(res.error ?? null);
      setChecks(res.checks);
    } catch {
      setError("Couldn't load findings. Try again in a moment.");
      setChecks([]);
    }
  }, []);

  useEffect(() => {
    if (context) void load();
  }, [context, load]);

  if (!checks) return <Spinner label="Checking this page" />;
  if (error) {
    return (
      <SectionMessage appearance="warning" title="Sentinel couldn't check this page">
        <Text>{error}</Text>
      </SectionMessage>
    );
  }

  const total = checks.reduce((n, c) => n + c.findings.length, 0);
  if (total === 0) {
    return (
      <SectionMessage appearance="success" title="Up to date">
        <Text>No linked Jira changes have made this page outdated.</Text>
      </SectionMessage>
    );
  }

  return (
    <Stack space="space.200">
      <Heading size="small">
        {total} section{total === 1 ? "" : "s"} may be outdated
      </Heading>
      {checks.flatMap((c) =>
        c.findings.map((f) => (
          <FindingCard key={`${c.issueKey}:${f.sectionId}`} pageId={c.pageId} issueKey={c.issueKey} finding={f} onDone={load} />
        )),
      )}
    </Stack>
  );
}

ForgeReconciler.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
