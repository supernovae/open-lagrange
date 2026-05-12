import React from "react";
import { Box, Text } from "ink";
import type { TuiViewModel } from "../../types.js";
import { theme } from "../../theme.js";

export function RunOutputPane({ run }: { readonly run: TuiViewModel["run"] }): React.ReactElement {
  const artifacts = run?.artifacts ?? [];
  const preset = recommendedPreset(artifacts);
  const selected = selectRecommendedArtifacts(artifacts, preset);
  const excludedCount = Math.max(0, artifacts.length - selected.length);
  return (
    <Box flexDirection="column">
      <Text color={theme.title}>Output</Text>
      <Text>Preset: {preset}</Text>
      <Text>Selected: {selected.length} · Excluded: {excludedCount}</Text>
      <Text>Commands:</Text>
      <Text>  open-lagrange output packet --run {run?.run_id ?? "<run_id>"} --type {packetType(preset)}</Text>
      <Text>  open-lagrange output digest --run {run?.run_id ?? "<run_id>"} --style {digestStyle(preset)}</Text>
      <Text>  open-lagrange output export --run {run?.run_id ?? "<run_id>"} --preset {preset} --format directory --output ./out</Text>
      <Text color={theme.title}>Recommended Outputs</Text>
      {selected.length ? selected.slice(0, 10).map((artifact) => (
        <Box key={artifact.artifact_id} flexDirection="column" marginBottom={1}>
          <Text>{artifact.title} ({artifact.kind})</Text>
          <Text color={theme.muted}>{artifact.artifact_id}</Text>
        </Box>
      )) : <Text color={theme.muted}>No output artifacts are currently available.</Text>}
    </Box>
  );
}

function recommendedPreset(artifacts: readonly { readonly kind: string }[]): "research_packet" | "developer_packet" | "final_outputs" {
  const kinds = new Set(artifacts.map((artifact) => artifact.kind));
  if (kinds.has("research_brief") || kinds.has("citation_index") || kinds.has("source_set")) return "research_packet";
  if (kinds.has("final_patch_artifact") || kinds.has("patch_artifact") || kinds.has("verification_report")) return "developer_packet";
  return "final_outputs";
}

function selectRecommendedArtifacts<T extends { readonly kind: string }>(artifacts: readonly T[], preset: string): readonly T[] {
  const kinds = preset === "research_packet"
    ? new Set(["research_brief", "citation_index", "source_set", "source_search_results", "markdown_export", "html_export", "planfile"])
    : preset === "developer_packet"
      ? new Set(["planfile", "evidence_bundle", "patch_plan", "patch_artifact", "final_patch_artifact", "verification_report", "review_report", "run_digest"])
      : new Set(["final_patch_artifact", "research_brief", "review_report", "markdown_export", "html_export", "pdf_export", "run_digest", "run_packet"]);
  return artifacts.filter((artifact) => kinds.has(artifact.kind));
}

function packetType(preset: string): "research" | "developer" | "general" {
  if (preset === "research_packet") return "research";
  if (preset === "developer_packet") return "developer";
  return "general";
}

function digestStyle(preset: string): "research" | "developer" | "concise" {
  if (preset === "research_packet") return "research";
  if (preset === "developer_packet") return "developer";
  return "concise";
}
