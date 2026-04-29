import React from "react";
import { Box, Text } from "ink";
import { listDemos } from "@open-lagrange/core/demos";
import type { TuiViewModel } from "../types.js";
import { theme } from "../theme.js";

export function DemoMode({ model }: { readonly model: TuiViewModel }): React.ReactElement {
  const hasDemoActivity = model.conversation.some((turn) =>
    turn.text.includes("demo")
    || turn.text.includes("Demo completed")
    || turn.text.includes("artifacts")
    || turn.title?.toLowerCase().includes("demo")
  );
  return (
    <Box flexDirection="column">
      {hasDemoActivity ? (
        <Box borderStyle="single" borderColor={theme.border} paddingX={1} flexDirection="column">
          <Text color={theme.accent}>Latest demo activity is journaled below.</Text>
          <Text color={theme.muted}>Use /run outputs latest for primary outputs, or /artifact show &lt;artifact_id&gt; for one artifact.</Text>
        </Box>
      ) : null}
      {listDemos().map((demo) => (
        <Box key={demo.demo_id} borderStyle="single" borderColor={theme.border} paddingX={1} flexDirection="column" marginTop={1}>
          <Text><Text color={theme.accent}>{demo.demo_id}</Text> · {demo.title}</Text>
          <Text color={theme.muted}>{demo.summary}</Text>
          <Text color={theme.muted}>Run: /demo run {demo.demo_id}</Text>
          {demo.demo_id === "repo-json-output" ? <Text color={theme.muted}>Live: /demo run repo-json-output --live</Text> : null}
        </Box>
      ))}
      <Box borderStyle="single" borderColor={theme.border} paddingX={1} marginTop={1} flexDirection="column">
        <Text color={theme.title}>Demo Output</Text>
        <Text color={theme.muted}>Dry-run creates Planfile, PatchPlan, PatchArtifact preview, verification, review, and timeline artifacts.</Text>
        <Text color={theme.muted}>Live repo demo copies the fixture, creates an isolated git worktree, runs PlanRunner/repository handlers, verifies, and exports a final patch.</Text>
      </Box>
    </Box>
  );
}
