import React from "react";
import { Box, Text } from "ink";
import type { TuiViewModel } from "../types.js";
import { theme } from "../theme.js";

export function RepositoryMode({ model }: { readonly model: TuiViewModel }): React.ReactElement {
  const plan = model.plan;
  const run = model.run;
  const activeTask = model.activeTask;
  const phase = plan?.current_node ?? activeTask?.repository_status?.current_phase ?? run?.active_node_id ?? "waiting";
  const changedFiles = plan?.changed_files.length ? plan.changed_files : model.changedFiles.map((file) => file.path);
  const verification = plan?.verification_reports.length ? plan.verification_reports : model.verificationResults.map((result) => result.command_id);
  const repair = plan?.repair_attempts ?? [];
  const modelCalls = plan?.model_call_artifact_refs ?? run?.model_calls.map((call) => call.artifact_id) ?? [];

  return (
    <Box flexDirection="column" gap={1}>
      <Box flexDirection="column">
        <Text color={theme.title}>Repository Workbench</Text>
        <Text color={theme.muted}>g goal  e evidence  p patch plan  d diff  v verification  r repair  s scope  m model calls  f final patch  x cleanup  q back</Text>
      </Box>
      {plan || activeTask || run ? (
        <Box flexDirection="column">
          <Text>Run: {run?.run_id ?? activeTask?.task_run_id ?? plan?.plan_id ?? "unknown"}</Text>
          <Text>Status: {run?.status ?? activeTask?.status ?? plan?.status ?? "unknown"} | phase: {phase} | live: {model.runConnectionState ?? "disconnected"}</Text>
          <Text>Worktree: {plan?.worktree_path ?? "not created yet"}</Text>
          <Box marginTop={1} flexDirection="column">
            <Text color={theme.title}>Progress</Text>
            {(plan?.dag_lines ?? run?.nodes.map((node) => `${node.node_id}: ${node.status}`) ?? []).slice(0, 10).map((line) => <Text key={line}>{line}</Text>)}
          </Box>
          <Box marginTop={1} flexDirection="column">
            <Text color={theme.title}>Changed Files</Text>
            {changedFiles.length > 0 ? changedFiles.slice(0, 12).map((file) => <Text key={file}>{file}</Text>) : <Text color={theme.muted}>No changed files recorded yet.</Text>}
          </Box>
          <Box marginTop={1} flexDirection="column">
            <Text color={theme.title}>Verification</Text>
            {verification.length > 0 ? verification.map((item) => <Text key={item}>{item}</Text>) : <Text color={theme.muted}>No verification report recorded yet.</Text>}
          </Box>
          {repair.length > 0 ? (
            <Box marginTop={1} flexDirection="column">
              <Text color={theme.title}>Repair</Text>
              {repair.map((item) => <Text key={item}>{item}</Text>)}
            </Box>
          ) : null}
          {modelCalls.length > 0 ? (
            <Box marginTop={1} flexDirection="column">
              <Text color={theme.title}>Model Calls</Text>
              {modelCalls.map((item) => <Text key={item}>{item}</Text>)}
            </Box>
          ) : null}
          {(run?.next_actions.length ?? 0) > 0 ? (
            <Box marginTop={1} flexDirection="column">
              <Text color={theme.title}>Next Actions</Text>
              {run?.next_actions.map((action) => <Text key={action.action_id}>{action.label}{action.command ? `: ${action.command}` : ""}</Text>)}
            </Box>
          ) : null}
        </Box>
      ) : (
        <Box flexDirection="column">
          <Text>Start repository work with /repo run "goal" from a Git repository.</Text>
          <Text color={theme.muted}>Use /plan repo "goal" to create a Planfile first.</Text>
        </Box>
      )}
    </Box>
  );
}
