import React, { useCallback, useEffect, useState } from "react";
import ForgeReconciler, { Button, Inline, SectionMessage, Stack, Text, useProductContext } from "@forge/react";
import { call } from "./api";
import type { PageCheck } from "../types";
import { ReviewList } from "./review-list";

/**
 * Confluence page banner: stays out of the way when the page is fine, and shows a short warning
 * (expandable into the full review) when linked Jira changes made sections outdated.
 */
function App() {
  const context = useProductContext();
  const [checks, setChecks] = useState<PageCheck[]>([]);
  const [open, setOpen] = useState(false);

  const load = useCallback(async () => {
    try {
      setChecks((await call("getPageFindings")).checks);
    } catch {
      setChecks([]); // The byline popup reports errors; the banner just stays hidden.
    }
  }, []);

  // The banner also renders on space pages, which have no content id: nothing to check there.
  const pageId = (context?.extension as { content?: { id?: string } } | undefined)?.content?.id;
  useEffect(() => {
    if (pageId) void load();
  }, [pageId, load]);

  const findings = checks.flatMap((c) => c.findings.map((f) => ({ check: c, finding: f })));
  if (findings.length === 0) return null;

  const issues = [...new Set(checks.filter((c) => c.findings.length).map((c) => c.issueKey))];
  const sections = findings.map(({ finding }) => finding.heading ?? "Intro");

  return (
    <SectionMessage
      appearance="warning"
      title={`${findings.length} section${findings.length === 1 ? "" : "s"} may be outdated after ${issues.join(", ")}`}
    >
      <Stack space="space.150">
        <Text>{sections.join(" · ")}</Text>
        {open && <ReviewList checks={checks} onChanged={load} showHeading={false} />}
        <Inline>
          <Button appearance={open ? "subtle" : "primary"} onClick={() => setOpen(!open)}>
            {open ? "Hide" : "Review suggested fixes"}
          </Button>
        </Inline>
      </Stack>
    </SectionMessage>
  );
}

ForgeReconciler.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
