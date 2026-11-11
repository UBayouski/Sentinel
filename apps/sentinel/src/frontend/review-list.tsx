import React, { useState } from "react";
import { Button, Heading, Inline, SectionMessage, Stack, Text } from "@forge/react";
import { call } from "./api";
import type { PageCheck } from "../types";
import { FindingCard } from "./finding-card";

interface Props {
  checks: PageCheck[];
  onChanged: () => void;
  /** Hide the heading when the container already shows one (banner). */
  showHeading?: boolean;
}

/** Findings for one page with per-section actions and "Apply all". Used by the byline popup and the banner. */
export function ReviewList({ checks, onChanged, showHeading = true }: Props) {
  const [busy, setBusy] = useState(false);
  const [summary, setSummary] = useState<{ applied: number; failed: string[]; skipped: number } | null>(null);

  const items = checks.flatMap((c) => c.findings.map((f) => ({ check: c, finding: f })));
  // "Apply all" only covers plain sections with a suggestion; tables or panels need a look first.
  const safe = items.filter(({ finding }) => finding.suggestedText && !finding.complex);

  const applyAll = async () => {
    setBusy(true);
    const failed: string[] = [];
    let applied = 0;
    // One at a time: each apply writes a new page version.
    for (const { check, finding } of safe) {
      const res = await call("applyFix", { pageId: check.pageId, issueKey: check.issueKey, sectionId: finding.sectionId });
      if (res.ok) applied++;
      else failed.push(`${finding.heading ?? "Intro"}: ${res.reason ?? "failed"}`);
    }
    setSummary({ applied, failed, skipped: items.length - safe.length });
    setBusy(false);
    onChanged();
  };

  return (
    <Stack space="space.200">
      {showHeading && items.length > 0 && (
        <Heading size="small">
          {items.length} section{items.length === 1 ? "" : "s"} may be outdated
        </Heading>
      )}

      {summary && (
        <SectionMessage appearance={summary.failed.length ? "warning" : "success"}>
          <Stack space="space.050">
            <Text>
              Applied {summary.applied} fix{summary.applied === 1 ? "" : "es"}.
              {summary.skipped > 0 ? ` ${summary.skipped} left for you to review (no suggestion, or tables/panels).` : ""}
            </Text>
            {summary.failed.map((f) => (
              <Text key={f}>{f}</Text>
            ))}
          </Stack>
        </SectionMessage>
      )}

      {safe.length > 1 && (
        <Inline>
          <Button appearance="primary" isDisabled={busy} onClick={applyAll}>
            {busy ? "Applying…" : `Apply all ${safe.length} suggestions`}
          </Button>
        </Inline>
      )}

      {items.map(({ check, finding }) => (
        <FindingCard
          key={`${check.issueKey}:${finding.sectionId}`}
          pageId={check.pageId}
          issueKey={check.issueKey}
          finding={finding}
          onDone={onChanged}
        />
      ))}
    </Stack>
  );
}
