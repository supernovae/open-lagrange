import React from "react";
import { Box, Text } from "ink";
import type { RunSnapshot } from "@open-lagrange/core/runs";
import { theme } from "../../theme.js";

export function RunDetailPane({ run }: { readonly run: RunSnapshot | undefined }): React.ReactElement {
  const active = run?.nodes.find((node) => node.node_id === run.active_node_id) ?? run?.nodes.find((node) => node.status === "failed" || node.status === "yielded") ?? run?.nodes[0];
  return (
    <Box flexDirection="column">
      <Text color={theme.title}>Details</Text>
      {active ? (
        <>
          <Text>{active.title}</Text>
          <Text color={theme.muted}>{active.kind} [{active.status}]</Text>
          <Text>Capabilities: {active.capability_refs.join(", ") || "none"}</Text>
          <Text>Artifacts: {active.artifact_refs.length}</Text>
          <Text>Approvals: {active.approval_refs.length}</Text>
        </>
      ) : <Text color={theme.muted}>No selected step.</Text>}
      {(run?.errors ?? []).slice(0, 4).map((error) => <Text key={error.error_id} color={theme.error}>{error.node_id ? `${error.node_id}: ` : ""}{error.message}</Text>)}
    </Box>
  );
}
