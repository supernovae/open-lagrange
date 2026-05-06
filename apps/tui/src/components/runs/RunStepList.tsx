import React from "react";
import { Box, Text } from "ink";
import type { RunSnapshot } from "@open-lagrange/core/runs";
import { theme } from "../../theme.js";

export function RunStepList({ run }: { readonly run: RunSnapshot | undefined }): React.ReactElement {
  return (
    <Box flexDirection="column">
      <Text color={theme.title}>Steps</Text>
      {(run?.nodes ?? []).slice(0, 12).map((node) => (
        <Text key={node.node_id} {...(node.node_id === run?.active_node_id ? { color: theme.accent } : {})}>
          {node.node_id === run?.active_node_id ? ">" : " "} {node.title} [{node.status}]
        </Text>
      ))}
      {run?.nodes.length === 0 ? <Text color={theme.muted}>No steps recorded.</Text> : null}
    </Box>
  );
}
