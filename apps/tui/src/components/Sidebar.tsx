import React from "react";
import { Box, Text } from "ink";
import type { TuiViewModel } from "../types.js";
import { statusColor, truncateText } from "../formatters.js";
import { theme } from "../theme.js";

export function Sidebar({ model, width, height }: { readonly model: TuiViewModel; readonly width: number; readonly height: number }): React.ReactElement {
  const status = model.project?.status?.status ?? model.activeTask?.status ?? "idle";
  const repo = model.activeTask?.repository_status;
  const textWidth = Math.max(16, width - 6);
  return (
    <Box flexDirection="column" width={width} height={height} borderStyle="single" borderColor={theme.border} paddingX={1} flexShrink={0}>
      <Text color={theme.title}>Project / Task Frame</Text>
      <Text>Status: <Text color={statusColor(status)}>{status}</Text></Text>
      <Text>Project: {truncateText(model.project?.project_id ?? "none", textWidth)}</Text>
      <Text>Task: {truncateText(model.activeTask?.task_run_id ?? "none", textWidth)}</Text>
      <Text>Phase: {repo?.current_phase ?? "none"}</Text>
      <Text>Workspace: {repo?.workspace_id ?? "unknown"}</Text>
      <Text>Repo: {repo?.repo_root ? truncateText(repo.repo_root, textWidth) : "none"}</Text>
      <Text>Approvals: {model.approvals.length}</Text>
      <Text>Plan: {model.plan?.plan_id ?? "none"}</Text>
      <Text>Changed: {model.changedFiles.length}</Text>
      <Text>Verification: {model.verificationResults.length > 0 ? verificationLabel(model) : "none"}</Text>
      <Box marginTop={1} flexDirection="column">
        <Text color={theme.title}>Commands</Text>
        <Text>/approve   /reject</Text>
        <Text>/plan      /diff</Text>
        <Text>/verify    /json</Text>
        <Text>tab pane   ctrl+q quit</Text>
      </Box>
    </Box>
  );
}

function verificationLabel(model: TuiViewModel): string {
  return model.verificationResults.every((result) => result.exit_code === 0) ? "passed" : "failed";
}
