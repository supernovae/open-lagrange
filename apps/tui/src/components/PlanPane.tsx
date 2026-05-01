import React from "react";
import { Box, Text } from "ink";
import type { TuiViewModel } from "../types.js";
import { theme } from "../theme.js";

export function PlanPane({ model }: { readonly model: TuiViewModel }): React.ReactElement {
  const plan = model.plan;
  const skill = model.skill;
  if (!plan && !skill) {
    return (
      <Box flexDirection="column">
        <Text color={theme.title}>Planfile</Text>
        <Text>No Planfile projection is available for the current view.</Text>
      </Box>
    );
  }
  return (
    <Box flexDirection="column">
      {skill ? (
        <Box flexDirection="column" marginBottom={1}>
          <Text color={theme.title}>Workflow Skill</Text>
          <Text>ID: {skill.skill_id}</Text>
          <Text>Goal: {skill.interpreted_goal}</Text>
          <Text>Pack matches: {(skill.existing_pack_matches.length > 0 ? skill.existing_pack_matches.join(", ") : "none")}</Text>
          <Text>Missing capabilities: {(skill.missing_capabilities.length > 0 ? skill.missing_capabilities.join(", ") : "none")}</Text>
          <Text>Scopes: {(skill.required_scopes.length > 0 ? skill.required_scopes.join(", ") : "none")}</Text>
          <Text>Secret refs: {(skill.required_secret_refs.length > 0 ? skill.required_secret_refs.join(", ") : "none")}</Text>
          <Text>Approvals: {(skill.approval_requirements.length > 0 ? skill.approval_requirements.join(", ") : "none")}</Text>
        </Box>
      ) : null}
      {plan ? (
      <>
      <Text color={theme.title}>Planfile</Text>
      <Text>ID: {plan.plan_id}</Text>
      <Text>Status: {plan.status}</Text>
      <Text>Current node: {plan.current_node ?? "none"}</Text>
      <Text>Capability: {plan.current_capability ?? "none"}</Text>
      <Text>Policy: {plan.policy_result ?? "none"}</Text>
      <Text>Markdown artifact: {plan.final_markdown_artifact ?? "none"}</Text>
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
        <Text>Evidence: {(plan.evidence_bundles.length > 0 ? plan.evidence_bundles.join(", ") : "none")}</Text>
        <Text>Validation: {(plan.patch_validation_reports.length > 0 ? plan.patch_validation_reports.join(", ") : "none")}</Text>
        <Text>Patch artifacts: {(plan.patch_artifacts.length > 0 ? plan.patch_artifacts.join(", ") : "none")}</Text>
        <Text>Scope requests: {(plan.scope_expansion_requests.length > 0 ? plan.scope_expansion_requests.join(", ") : "none")}</Text>
        {(plan.scope_expansion_details.length > 0 ? plan.scope_expansion_details : []).map((line) => <Text key={line}>Scope detail: {line}</Text>)}
        <Text>Verification: {(plan.verification_reports.length > 0 ? plan.verification_reports.join(", ") : "none")}</Text>
        <Text>Repair attempts: {(plan.repair_attempts.length > 0 ? plan.repair_attempts.length : 0)}</Text>
      </Box>
      <Box marginTop={1} flexDirection="column">
        <Text color={theme.title}>Validation Errors</Text>
        {(plan.validation_errors.length > 0 ? plan.validation_errors : ["none"]).map((line) => <Text key={line}>{line}</Text>)}
      </Box>
      <Box marginTop={1} flexDirection="column">
        <Text color={theme.title}>Warnings</Text>
        {(plan.warnings.length > 0 ? plan.warnings : ["none"]).map((line) => <Text key={line}>{line}</Text>)}
      </Box>
      </>
      ) : null}
    </Box>
  );
}
