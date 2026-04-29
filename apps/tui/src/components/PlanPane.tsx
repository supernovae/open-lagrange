import React from "react";
import { Box, Text } from "ink";
import type { TuiViewModel } from "../types.js";
import { theme } from "../theme.js";

export function PlanPane({ model }: { readonly model: TuiViewModel }): React.ReactElement {
  const plan = model.plan;
  if (!plan) {
    return (
      <Box flexDirection="column">
        <Text color={theme.title}>Planfile</Text>
        <Text>No Planfile projection is available for the current view.</Text>
      </Box>
    );
  }
  return (
    <Box flexDirection="column">
      <Text color={theme.title}>Planfile</Text>
      <Text>ID: {plan.plan_id}</Text>
      <Text>Status: {plan.status}</Text>
      <Text>Current node: {plan.current_node ?? "none"}</Text>
      <Text>Worktree: {plan.worktree_path ?? "none"}</Text>
      <Box marginTop={1} flexDirection="column">
        <Text color={theme.title}>DAG</Text>
        {plan.dag_lines.map((line) => <Text key={line}>{line}</Text>)}
      </Box>
      <Box marginTop={1} flexDirection="column">
        <Text color={theme.title}>Approvals</Text>
        {(plan.approval_requirements.length > 0 ? plan.approval_requirements : ["none"]).map((line) => <Text key={line}>{line}</Text>)}
      </Box>
      <Box marginTop={1} flexDirection="column">
        <Text color={theme.title}>Artifacts</Text>
        {(plan.artifact_refs.length > 0 ? plan.artifact_refs : ["none"]).map((line) => <Text key={line}>{line}</Text>)}
      </Box>
      <Box marginTop={1} flexDirection="column">
        <Text color={theme.title}>Repository</Text>
        <Text>Changed files: {(plan.changed_files.length > 0 ? plan.changed_files.join(", ") : "none")}</Text>
        <Text>Patch artifacts: {(plan.patch_artifacts.length > 0 ? plan.patch_artifacts.join(", ") : "none")}</Text>
        <Text>Verification: {(plan.verification_reports.length > 0 ? plan.verification_reports.join(", ") : "none")}</Text>
        <Text>Repair attempts: {(plan.repair_attempts.length > 0 ? plan.repair_attempts.length : 0)}</Text>
      </Box>
      <Box marginTop={1} flexDirection="column">
        <Text color={theme.title}>Validation Errors</Text>
        {(plan.validation_errors.length > 0 ? plan.validation_errors : ["none"]).map((line) => <Text key={line}>{line}</Text>)}
      </Box>
    </Box>
  );
}
