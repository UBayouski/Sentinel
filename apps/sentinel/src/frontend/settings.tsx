import React, { useEffect, useState } from "react";
import ForgeReconciler, {
  Box,
  Button,
  CheckboxGroup,
  Heading,
  HelperMessage,
  Inline,
  Label,
  SectionMessage,
  Select,
  Spinner,
  Stack,
  Text,
  Textfield,
  Toggle,
} from "@forge/react";
import { invoke } from "@forge/bridge";
import type { Settings } from "../settings";

type Option = { value: string; label: string };
interface Loaded {
  settings: Settings;
  defaults: Settings;
  fieldOptions: Option[];
  projects: Option[];
  spaces: Option[];
}

const CONFIDENCE: Option[] = [0.5, 0.6, 0.7, 0.8, 0.9].map((n) => ({ value: String(n), label: `${n * 100}% or higher` }));
const MAX_PAGES: Option[] = [3, 5, 8, 12, 20].map((n) => ({ value: String(n), label: `${n} pages` }));

/** Jira admin page: what Sentinel watches, where it looks, and what it shows. */
function App() {
  const [data, setData] = useState<Loaded | null>(null);
  const [s, setS] = useState<Settings | null>(null);
  const [extra, setExtra] = useState("");
  const [status, setStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");

  useEffect(() => {
    void (invoke("getSettings") as Promise<Loaded>).then((d) => {
      setData(d);
      setS(d.settings);
      setExtra(d.settings.extraFields.join(", "));
    });
  }, []);

  if (!data || !s) return <Spinner label="Loading settings" />;

  const update = (patch: Partial<Settings>) => {
    setS({ ...s, ...patch });
    setStatus("idle");
  };
  const pick = (options: Option[], values: string[]) => options.filter((o) => values.includes(o.value));
  // Keep saved keys visible even if the admin can't list them (e.g. no access to that space).
  const withSaved = (options: Option[], values: string[]) => [
    ...options,
    ...values.filter((v) => !options.some((o) => o.value === v)).map((v) => ({ value: v, label: v })),
  ];
  const projectOptions = withSaved(data.projects, s.projects);
  const spaceOptions = withSaved(data.spaces, s.spaces);

  const save = async (next: Settings) => {
    setStatus("saving");
    try {
      const res = (await invoke("saveSettings", {
        ...next,
        extraFields: extra.split(",").map((f) => f.trim()).filter(Boolean),
      })) as { ok: boolean; settings: Settings };
      setS(res.settings);
      setExtra(res.settings.extraFields.join(", "));
      setStatus("saved");
    } catch {
      setStatus("error");
    }
  };

  const nothingWatched = s.fields.length === 0 && extra.trim() === "";

  return (
    <Stack space="space.300">
      <Stack space="space.100">
        <Heading size="large">Stale Doc Sentinel</Heading>
        <Text>
          When a Jira issue changes, Sentinel checks the Confluence pages linked to it or mentioning it, and flags sections
          that no longer match.
        </Text>
      </Stack>

      <Inline space="space.100" alignBlock="center">
        <Toggle
          id="enabled"
          isChecked={s.enabled}
          onChange={() => update({ enabled: !s.enabled })}
        />
        <Label labelFor="enabled">Check docs automatically when issues change</Label>
      </Inline>

      <Section title="What to watch">
        <Stack space="space.050">
          <Label labelFor="projects">Projects</Label>
          <Select
            inputId="projects"
            isMulti
            placeholder="All projects"
            options={projectOptions}
            value={pick(projectOptions, s.projects)}
            onChange={(v: Option[] | null) => update({ projects: (v ?? []).map((o) => o.value) })}
          />
          <HelperMessage>Leave empty to watch every project.</HelperMessage>
        </Stack>
        <Stack space="space.050">
          <Label labelFor="fields">Fields that should trigger a check</Label>
          <CheckboxGroup
            name="fields"
            options={data.fieldOptions}
            value={s.fields}
            onChange={(values: string[]) => update({ fields: values })}
          />
        </Stack>
        <Stack space="space.050">
          <Label labelFor="extra">Other fields (custom fields)</Label>
          <Textfield
            id="extra"
            placeholder="Business rules, Requirements"
            value={extra}
            onChange={(e) => {
              setExtra(e.target.value);
              setStatus("idle");
            }}
          />
          <HelperMessage>Field names as Jira shows them, separated by commas.</HelperMessage>
        </Stack>
        {nothingWatched && (
          <SectionMessage appearance="warning">
            <Text>No fields selected: automatic checks won't find any changes to compare.</Text>
          </SectionMessage>
        )}
      </Section>

      <Section title="Where to look">
        <Stack space="space.050">
          <Label labelFor="spaces">Confluence spaces</Label>
          <Select
            inputId="spaces"
            isMulti
            placeholder="All spaces"
            options={spaceOptions}
            value={pick(spaceOptions, s.spaces)}
            onChange={(v: Option[] | null) => update({ spaces: (v ?? []).map((o) => o.value) })}
          />
          <HelperMessage>Leave empty to check pages in any space.</HelperMessage>
        </Stack>
        <Stack space="space.050">
          <Label labelFor="maxPages">Most pages checked per change</Label>
          <Select
            inputId="maxPages"
            options={MAX_PAGES}
            value={MAX_PAGES.find((o) => o.value === String(s.maxPages)) ?? { value: String(s.maxPages), label: `${s.maxPages} pages` }}
            onChange={(o: Option | null) => o && update({ maxPages: Number(o.value) })}
          />
          <HelperMessage>Each page is one AI check. Linked pages are checked first.</HelperMessage>
        </Stack>
      </Section>

      <Section title="What to show">
        <Stack space="space.050">
          <Label labelFor="confidence">Show findings with confidence</Label>
          <Select
            inputId="confidence"
            options={CONFIDENCE}
            value={CONFIDENCE.find((o) => Number(o.value) === s.minConfidence) ?? CONFIDENCE[1]!}
            onChange={(o: Option | null) => o && update({ minConfidence: Number(o.value) })}
          />
        </Stack>
        <Inline space="space.100" alignBlock="center">
          <Toggle
            id="uncertain"
            isChecked={s.includeUncertain}
            onChange={() => update({ includeUncertain: !s.includeUncertain })}
          />
          <Label labelFor="uncertain">Also show "maybe outdated" sections</Label>
        </Inline>
        <Text size="small" color="color.text.subtlest">
          Changes apply to the next check. Existing findings stay until the page is checked again.
        </Text>
      </Section>

      {status === "saved" && (
        <SectionMessage appearance="success">
          <Text>Settings saved.</Text>
        </SectionMessage>
      )}
      {status === "error" && (
        <SectionMessage appearance="error">
          <Text>Couldn't save settings. Try again.</Text>
        </SectionMessage>
      )}

      <Inline space="space.100">
        <Button appearance="primary" isDisabled={status === "saving"} onClick={() => save(s)}>
          {status === "saving" ? "Saving…" : "Save"}
        </Button>
        <Button
          appearance="subtle"
          isDisabled={status === "saving"}
          onClick={() => {
            setExtra("");
            void save(data.defaults);
          }}
        >
          Reset to defaults
        </Button>
      </Inline>
    </Stack>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <Box padding="space.200" backgroundColor="elevation.surface.sunken">
      <Stack space="space.200">
        <Heading size="small">{title}</Heading>
        {children}
      </Stack>
    </Box>
  );
}

ForgeReconciler.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
