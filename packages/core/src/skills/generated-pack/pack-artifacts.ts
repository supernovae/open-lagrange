import { join } from "node:path";
import { createArtifactSummary, registerArtifacts } from "../../artifacts/artifact-viewer.js";
import type { ArtifactSummary } from "../../artifacts/artifact-model.js";
import type { PackBuildPlan } from "./pack-build-plan.js";
import type { PackValidationReport } from "./pack-validator.js";

export function generatedPackArtifactSummaries(input: {
  readonly pack_path: string;
  readonly plan: PackBuildPlan;
  readonly validation_report?: PackValidationReport;
  readonly now?: string;
}): readonly ArtifactSummary[] {
  const now = input.now ?? new Date().toISOString();
  const base = input.pack_path;
  return [
    createArtifactSummary({
      artifact_id: `${input.plan.pack_id}:pack_build_plan`,
      kind: "pack_build_plan",
      title: "Pack build plan",
      summary: input.plan.reason_new_pack_required,
      path_or_uri: join(base, "artifacts", "build-plan.json"),
      related_skill_id: input.plan.source_skill_id,
      related_pack_id: input.plan.pack_id,
      content_type: "application/json",
      created_at: now,
    }),
    createArtifactSummary({
      artifact_id: `${input.plan.pack_id}:generated_pack`,
      kind: "generated_pack",
      title: "Generated pack directory",
      summary: input.plan.pack_name,
      path_or_uri: base,
      related_skill_id: input.plan.source_skill_id,
      related_pack_id: input.plan.pack_id,
      content_type: "inode/directory",
      created_at: now,
    }),
    createArtifactSummary({
      artifact_id: `${input.plan.pack_id}:pack_manifest`,
      kind: "pack_manifest",
      title: "Generated pack manifest",
      summary: input.plan.description,
      path_or_uri: join(base, "open-lagrange.pack.yaml"),
      related_skill_id: input.plan.source_skill_id,
      related_pack_id: input.plan.pack_id,
      content_type: "text/yaml",
      created_at: now,
    }),
    ...(input.validation_report ? [createArtifactSummary({
      artifact_id: `${input.plan.pack_id}:pack_validation_report`,
      kind: "pack_validation_report",
      title: "Pack validation report",
      summary: input.validation_report.status,
      path_or_uri: join(base, "artifacts", "validation-report.json"),
      related_skill_id: input.plan.source_skill_id,
      related_pack_id: input.plan.pack_id,
      content_type: "application/json",
      created_at: now,
    })] : []),
  ];
}

export function registerGeneratedPackArtifacts(input: {
  readonly pack_path: string;
  readonly plan: PackBuildPlan;
  readonly validation_report?: PackValidationReport;
  readonly now?: string;
}): readonly ArtifactSummary[] {
  const artifacts = generatedPackArtifactSummaries(input);
  registerArtifacts({ artifacts, ...(input.now ? { now: input.now } : {}) });
  return artifacts;
}
