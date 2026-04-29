import React from "react";
import { Box, Text } from "ink";
import type { TuiViewModel } from "../types.js";
import { formatJson } from "../formatters.js";
import { theme } from "../theme.js";

export function ArtifactJsonPane({ model }: { readonly model: TuiViewModel }): React.ReactElement {
  const value = model.artifacts.length > 0 ? model.artifacts : model.activeTask?.result ?? model.project ?? {};
  return (
    <Box flexDirection="column">
      <Text color={theme.title}>Artifact JSON</Text>
      <Text>{formatJson(value, 3600)}</Text>
    </Box>
  );
}
