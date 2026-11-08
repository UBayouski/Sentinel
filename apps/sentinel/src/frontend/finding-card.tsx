import React, { useState } from "react";
import { Box, Button, Inline, Lozenge, SectionMessage, Stack, Text, TextArea } from "@forge/react";
import { call } from "./api";
import type { StoredFinding } from "../types";

interface Props {
  pageId: string;
  issueKey: string;
  finding: StoredFinding;
  onDone: () => void;
}

/** One outdated section: current text, suggested text, why, and Apply / Edit / Dismiss. */
export function FindingCard({ pageId, issueKey, finding, onDone }: Props) {
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(finding.suggestedText ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const act = async (fn: "applyFix" | "dismiss", extra: { text?: string } = {}) => {
    setBusy(true);
    setError(null);
    const res = await call(fn, {
      pageId,
      issueKey,
      sectionId: finding.sectionId,
      ...extra,
    });
    setBusy(false);
    if (res.ok) onDone();
    else setError(res.reason ?? "Something went wrong.");
  };

  return (
    <Box padding="space.150" backgroundColor="elevation.surface.raised">
      <Stack space="space.100">
        <Inline space="space.100" alignBlock="center">
          <Text weight="bold">{finding.heading ?? "Intro"}</Text>
          <Lozenge appearance={finding.status === "outdated" ? "moved" : "default"}>
            {finding.status === "outdated" ? "Outdated" : "Maybe outdated"}
          </Lozenge>
          <Text size="small" color="color.text.subtlest">
            from {issueKey}
          </Text>
        </Inline>

        <Text>
          <Text weight="semibold">Why: </Text>
          {finding.reason}
        </Text>

        <Text color="color.text.subtle">Now: {truncate(finding.currentText)}</Text>

        {finding.suggestedText &&
          (editing ? (
            <TextArea value={text} onChange={(e) => setText(e.target.value)} />
          ) : (
            <Text color="color.text.success">Suggested: {truncate(finding.suggestedText)}</Text>
          ))}

        {finding.complex && (
          <SectionMessage appearance="information">
            <Text>This section has tables or panels. Applying replaces them with plain text, so editing first is safer.</Text>
          </SectionMessage>
        )}
        {error && (
          <SectionMessage appearance="error">
            <Text>{error}</Text>
          </SectionMessage>
        )}

        <Inline space="space.100">
          {finding.suggestedText && (
            <Button
              appearance="primary"
              isDisabled={busy}
              onClick={() => act("applyFix", editing ? { text } : {})}
            >
              {editing ? "Apply edited" : "Apply"}
            </Button>
          )}
          {finding.suggestedText && !editing && (
            <Button isDisabled={busy} onClick={() => setEditing(true)}>
              Edit
            </Button>
          )}
          <Button appearance="subtle" isDisabled={busy} onClick={() => act("dismiss")}>
            Dismiss
          </Button>
        </Inline>
      </Stack>
    </Box>
  );
}

function truncate(s: string, n = 400) {
  return s.length > n ? `${s.slice(0, n)}…` : s;
}
