import { listArtifacts, listArtifactsForPlan, type ArtifactSummary } from "../../artifacts/index.js";
import { buildRunSnapshot } from "../../runs/run-snapshot-builder.js";
import { stableHash } from "../../util/hash.js";
import { artifactAllowedForOutput } from "./policy.js";
import type { ArtifactSelectionInput, ArtifactSelectionResult, ExcludedArtifact, OutputPreset } from "./schemas.js";

const presetKinds: Record<OutputPreset, readonly string[]> = {
  final_outputs: ["final_patch_artifact", "research_brief", "review_report", "markdown_export", "html_export", "pdf_export", "run_digest", "run_packet"],
  research_packet: ["research_brief", "citation_index", "source_set", "source_search_results", "markdown_export", "html_export", "execution_timeline", "planfile"],
  developer_packet: ["planfile", "evidence_bundle", "patch_plan", "patch_artifact", "final_patch_artifact", "verification_report", "review_report", "run_digest"],
  debug_packet: ["execution_timeline", "policy_decision_report", "validation_report", "simulation_report", "plan_check_report", "model_call", "raw_log"],
  all_safe: [],
};

const defaultExcludedKinds = new Set(["raw_log", "source_snapshot", "source_text", "model_call", "capability_step_result"]);

export async function selectArtifacts(input: ArtifactSelectionInput, indexPath?: string): Promise<ArtifactSelectionResult> {
  const warnings: string[] = [];
  const excluded: ExcludedArtifact[] = [];
  const candidateMap = new Map<string, ArtifactSummary>();
  const all = listArtifacts(indexPath);
  const allById = new Map(all.map((artifact) => [artifact.artifact_id, artifact]));

  if (input.artifact_ids?.length) {
    for (const artifactId of input.artifact_ids) {
      const artifact = allById.get(artifactId);
      if (artifact) candidateMap.set(artifact.artifact_id, artifact);
      else excluded.push({ artifact_id: artifactId, reason: "not_found" });
    }
  }
  if (input.plan_id) {
    for (const artifact of listArtifactsForPlan(input.plan_id, indexPath)) candidateMap.set(artifact.artifact_id, artifact);
  }
  if (input.run_id) {
    const snapshot = await buildRunSnapshot({ run_id: input.run_id }).catch(() => undefined);
    for (const item of snapshot?.artifacts ?? []) {
      const artifact = allById.get(item.artifact_id);
      if (artifact) candidateMap.set(artifact.artifact_id, artifact);
    }
    for (const artifact of all) {
      if (artifact.related_run_id === input.run_id || artifact.related_plan_id === snapshot?.plan_id || artifact.produced_by_plan_id === snapshot?.plan_id) {
        candidateMap.set(artifact.artifact_id, artifact);
      }
    }
    if (!snapshot) warnings.push(`run_snapshot_missing:${input.run_id}`);
  }
  if (!input.run_id && !input.plan_id && !input.artifact_ids?.length) {
    warnings.push("no_run_plan_or_artifacts_provided");
  }

  const includeKinds = input.include_kinds?.length ? new Set(input.include_kinds) : new Set(presetKinds[input.preset] ?? []);
  const excludeKinds = new Set(input.exclude_kinds ?? []);
  const selected: ArtifactSummary[] = [];
  for (const artifact of [...candidateMap.values()].sort(compareArtifacts)) {
    if (excludeKinds.has(artifact.kind)) {
      excluded.push({ artifact_id: artifact.artifact_id, reason: "kind_excluded" });
      continue;
    }
    if (includeKinds.size > 0 && !includeKinds.has(artifact.kind)) {
      excluded.push({ artifact_id: artifact.artifact_id, reason: "kind_excluded" });
      continue;
    }
    if (includeKinds.size === 0 && defaultExcludedKinds.has(artifact.kind) && !allowNoisyKind(artifact.kind, input)) {
      excluded.push({ artifact_id: artifact.artifact_id, reason: artifact.kind === "raw_log" ? "raw_log_excluded" : artifact.kind === "model_call" ? "model_call_excluded" : "kind_excluded" });
      continue;
    }
    const allowed = artifactAllowedForOutput({ artifact, include_model_calls: input.include_model_calls, include_raw_logs: input.include_raw_logs, include_redacted_only: input.include_redacted_only });
    if (!allowed.allowed) {
      excluded.push({ artifact_id: artifact.artifact_id, reason: allowed.reason });
      continue;
    }
    if (selected.length >= input.max_artifacts) {
      excluded.push({ artifact_id: artifact.artifact_id, reason: "limit_exceeded" });
      continue;
    }
    selected.push(artifact);
  }

  return { selected_artifacts: selected, excluded_artifacts: excluded, warnings };
}

export function selectionIdFor(input: unknown): string {
  return `artifact_selection_${stableHash(input).slice(0, 18)}`;
}

function allowNoisyKind(kind: string, input: ArtifactSelectionInput): boolean {
  if (kind === "raw_log") return input.include_raw_logs;
  if (kind === "model_call") return input.include_model_calls;
  return input.preset === "debug_packet";
}

function compareArtifacts(left: ArtifactSummary, right: ArtifactSummary): number {
  return score(right) - score(left) || left.created_at.localeCompare(right.created_at) || left.artifact_id.localeCompare(right.artifact_id);
}

function score(artifact: ArtifactSummary): number {
  if (artifact.artifact_role === "primary_output") return 100;
  if (artifact.kind === "final_patch_artifact" || artifact.kind === "research_brief") return 90;
  if (artifact.kind === "review_report" || artifact.kind === "markdown_export" || artifact.kind === "html_export") return 80;
  if (artifact.kind === "citation_index" || artifact.kind === "source_set" || artifact.kind === "verification_report") return 70;
  if (artifact.kind === "planfile") return 50;
  return 10;
}
