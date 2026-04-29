import React from "react";
import { Box, Text } from "ink";
import type { TuiViewModel } from "../types.js";
import { formatJson } from "../formatters.js";
import { theme } from "../theme.js";

export function ArtifactJsonPane({ model }: { readonly model: TuiViewModel }): React.ReactElement {
  const value = model.artifacts.length > 0 ? model.artifacts : model.activeTask?.result ?? model.project;
  return (
    <Box flexDirection="column">
      <Text color={theme.title}>Artifacts</Text>
      {value ? (
        <Text>{formatJson(value, 3600)}</Text>
      ) : (
        <Box flexDirection="column">
          <Text color={theme.accent}>Run and artifact command output is journaled below.</Text>
          <Text color={theme.muted}>Use /run outputs latest to see the latest run's primary outputs.</Text>
          <Text color={theme.muted}>Use /artifact recent to see high-signal recent artifacts.</Text>
          <Text color={theme.muted}>Use /artifact show &lt;artifact_id&gt; to inspect a specific artifact.</Text>
        </Box>
      )}
    </Box>
  );
}
