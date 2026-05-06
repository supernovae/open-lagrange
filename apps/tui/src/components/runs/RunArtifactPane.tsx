import React from "react";
import { Box, Text } from "ink";
import type { RunSnapshot } from "@open-lagrange/core/runs";
import { theme } from "../../theme.js";

export function RunArtifactPane({ run }: { readonly run: RunSnapshot | undefined }): React.ReactElement {
  return (
    <Box flexDirection="column">
      <Text color={theme.title}>Artifacts</Text>
      {(run?.artifacts ?? []).slice(0, 10).map((artifact) => (
        <Text key={artifact.artifact_id}>{artifact.kind}: {artifact.title} ({artifact.artifact_id})</Text>
      ))}
      {run?.artifacts.length === 0 ? <Text color={theme.muted}>No artifacts recorded.</Text> : null}
    </Box>
  );
}
