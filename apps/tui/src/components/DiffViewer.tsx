import React from "react";
import { Box, Text } from "ink";
import type { TuiViewModel } from "../types.js";
import { truncateText } from "../formatters.js";
import { theme } from "../theme.js";

export function DiffViewer({ model }: { readonly model: TuiViewModel }): React.ReactElement {
  const diff = String(model.artifacts.find((artifact) => artifact.artifact_type === "diff")?.value ?? "No diff recorded.");
  return (
    <Box flexDirection="column">
      <Text color={theme.title}>Diff</Text>
      {model.changedFiles.map((file) => <Text key={file.path}>changed: {file.path}</Text>)}
      <Text>{truncateText(diff, 3200)}</Text>
    </Box>
  );
}
