import React from "react";
import { Box, Text } from "ink";
import type { ArtifactSummary, TuiViewModel } from "../types.js";
import { formatJson, truncateText } from "../formatters.js";
import { theme } from "../theme.js";

const packArtifactTypes = new Set<ArtifactSummary["artifact_type"]>([
  "skill_frame",
  "pack_build_plan",
  "generated_pack",
  "pack_manifest",
  "pack_validation_report",
  "pack_test_report",
  "pack_install_report",
]);

export function PackBuilderPane({ model }: { readonly model: TuiViewModel }): React.ReactElement {
  const artifacts = model.artifacts.filter((artifact) => packArtifactTypes.has(artifact.artifact_type));
  const validation = artifacts.find((artifact) => artifact.artifact_type === "pack_validation_report");
  const status = validationStatus(validation?.value);
  return (
    <Box flexDirection="column">
      <Text color={theme.title}>Generated Capability Packs</Text>
      <Text>Build from CLI: open-lagrange pack build skills.md --dry-run</Text>
      <Text>Validate: open-lagrange pack validate .open-lagrange/generated-packs/&lt;pack_id&gt;</Text>
      <Text>Install after review: open-lagrange pack install .open-lagrange/generated-packs/&lt;pack_id&gt;</Text>
      <Box marginTop={1} flexDirection="column">
        <Text color={theme.title}>Install readiness</Text>
        <Text>{status}</Text>
      </Box>
      <Box marginTop={1} flexDirection="column">
        <Text color={theme.title}>Artifacts</Text>
        {artifacts.length === 0 ? <Text>No generated pack artifacts are active in this project.</Text> : artifacts.map((artifact) => (
          <Text key={artifact.artifact_id}>{artifact.artifact_type}: {truncateText(artifact.title, 80)}</Text>
        ))}
      </Box>
      {validation ? (
        <Box marginTop={1} flexDirection="column">
          <Text color={theme.title}>Validation Report</Text>
          <Text>{formatJson(validation.value, 2200)}</Text>
        </Box>
      ) : null}
    </Box>
  );
}

function validationStatus(value: unknown): string {
  if (!value || typeof value !== "object") return "No validation report loaded.";
  const status = (value as { readonly status?: unknown }).status;
  if (status === "pass") return "Ready for explicit install.";
  if (status === "requires_manual_review") return "Manual review required before install.";
  if (status === "fail") return "Install blocked until validation failures are fixed.";
  return "Validation status unknown.";
}
