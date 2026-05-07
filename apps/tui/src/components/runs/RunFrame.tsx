import React from "react";
import { Box, Text } from "ink";
import type { RunSnapshot } from "@open-lagrange/core/runs";
import { theme } from "../../theme.js";
import { RunStepList } from "./RunStepList.js";
import type { RunConnectionState } from "../../types.js";

export function RunFrame({ run, connectionState }: { readonly run: RunSnapshot | undefined; readonly connectionState?: RunConnectionState }): React.ReactElement {
  return (
    <Box flexDirection="column">
      <Text color={theme.title}>{run?.plan_title ?? "Run Console"}</Text>
      <Text>Status: {run?.status ?? "not loaded"} | Runtime: {run?.runtime ?? "unknown"} | Live: {connectionState ?? "disconnected"} {run?.active_node_id ? `| Active: ${run.active_node_id}` : ""}</Text>
      <Text color={theme.muted}>a approvals | f artifacts | m model calls | l logs | p plan | r resume/retry | e explain | q back</Text>
      <RunStepList run={run} />
    </Box>
  );
}
