import React from "react";
import { Box, Text } from "ink";
import type { TuiViewModel } from "../types.js";
import { statusColor, truncateText } from "../formatters.js";
import { theme } from "../theme.js";

export function Sidebar({ model }: { readonly model: TuiViewModel }): React.ReactElement {
  const status = model.project?.status?.status ?? model.activeTask?.status ?? "idle";
  const repo = model.activeTask?.repository_status;
  return (
    <Box flexDirection="column" width={34} borderStyle="single" borderColor={theme.border} paddingX={1}>
      <Text color={theme.title}>Project / Task Frame</Text>
      <Text>Status: <Text color={statusColor(status)}>{status}</Text></Text>
      <Text>Project: {model.project?.project_id ?? "none"}</Text>
      <Text>Task: {model.activeTask?.task_run_id ?? "none"}</Text>
      <Text>Phase: {repo?.current_phase ?? "none"}</Text>
      <Text>Workspace: {repo?.workspace_id ?? "unknown"}</Text>
      <Text>Repo: {repo?.repo_root ? truncateText(repo.repo_root, 28) : "none"}</Text>
      <Text>Approvals: {model.approvals.length}</Text>
      <Text>Changed: {model.changedFiles.length}</Text>
      <Text>Verification: {model.verificationResults.length > 0 ? verificationLabel(model) : "none"}</Text>
      <Box marginTop={1} flexDirection="column">
        <Text color={theme.title}>Controls</Text>
        <Text>a approve   x reject</Text>
        <Text>d diff      v verify</Text>
        <Text>j json      ? help</Text>
        <Text>tab pane    q quit</Text>
      </Box>
    </Box>
  );
}

function verificationLabel(model: TuiViewModel): string {
  return model.verificationResults.every((result) => result.exit_code === 0) ? "passed" : "failed";
}
