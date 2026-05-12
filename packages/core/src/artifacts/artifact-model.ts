import { z } from "zod";
import { ExecutionMode } from "../runtime/execution-mode.js";

export const ArtifactKind = z.enum([
  "planfile",
  "skill_frame",
  "workflow_skill",
  "pack_build_plan",
  "generated_pack",
  "pack_manifest",
  "pack_validation_report",
  "pack_test_report",
  "pack_install_report",
  "pack_smoke_report",
  "policy_decision_report",
  "evidence_bundle",
  "patch_plan_context",
  "patch_plan",
  "patch_validation_report",
  "patch_artifact",
  "final_patch_artifact",
  "scope_expansion_request",
  "repair_patch_plan",
  "repair_decision",
  "verification_report",
  "review_report",
  "source_search_results",
  "source_snapshot",
  "source_text",
  "source_set",
  "research_brief",
  "citation_index",
  "markdown_export",
  "capability_step_result",
  "approval_request",
  "execution_timeline",
  "worktree_session",
  "model_call",
  "raw_log",
  "edited_planfile_snapshot",
  "planfile_update_report",
  "planfile_diff",
  "regenerated_planfile",
  "validation_report",
  "simulation_report",
  "plan_check_report",
  "plan_library_manifest",
  "plan_template",
  "saved_planfile",
  "artifact_selection",
  "run_digest",
  "run_packet",
  "artifact_manifest",
  "html_export",
  "pdf_export",
  "artifact_bundle",
  "zip_export",
]);

export const ArtifactRole = z.enum(["primary_output", "supporting_evidence", "debug_log", "intermediate", "superseded"]);

export const ArtifactSummary = z.object({
  artifact_id: z.string().min(1),
  kind: ArtifactKind,
  artifact_role: ArtifactRole.optional(),
  title: z.string().min(1),
  summary: z.string(),
  path_or_uri: z.string().min(1),
  created_at: z.string().datetime(),
  updated_at: z.string().datetime().optional(),
  related_run_id: z.string().min(1).optional(),
  related_demo_id: z.string().min(1).optional(),
  related_plan_id: z.string().min(1).optional(),
  related_skill_id: z.string().min(1).optional(),
  related_task_id: z.string().min(1).optional(),
  related_pack_id: z.string().min(1).optional(),
  produced_by_pack_id: z.string().min(1).optional(),
  produced_by_capability_id: z.string().min(1).optional(),
  produced_by_plan_id: z.string().min(1).optional(),
  produced_by_node_id: z.string().min(1).optional(),
  input_artifact_refs: z.array(z.string().min(1)).optional(),
  output_artifact_refs: z.array(z.string().min(1)).optional(),
  source_mode: ExecutionMode.optional(),
  execution_mode: ExecutionMode.default("live"),
  fixture_id: z.string().min(1).optional(),
  fixture_set: z.string().min(1).optional(),
  live: z.boolean().optional(),
  mode_warning: z.string().min(1).optional(),
  validation_status: z.string().min(1).optional(),
  redaction_status: z.enum(["redacted", "not_redacted", "unknown"]).optional(),
  redacted: z.boolean(),
  restricted: z.boolean().optional(),
  exportable: z.boolean(),
  output_format: z.string().min(1).optional(),
  checksum_sha256: z.string().regex(/^[a-f0-9]{64}$/).optional(),
  content_type: z.string().min(1).optional(),
  size_bytes: z.number().int().min(0).optional(),
}).strict();

export const ArtifactIndex = z.object({
  schema_version: z.literal("open-lagrange.artifacts.v1"),
  artifacts: z.array(ArtifactSummary),
  updated_at: z.string().datetime(),
}).strict();

export const RunStatus = z.enum(["running", "completed", "failed", "yielded"]);
export const WorkflowKind = z.enum(["demo", "repository", "skill", "pack", "plan", "manual"]);

export const RunSummary = z.object({
  run_id: z.string().min(1),
  workflow_kind: WorkflowKind,
  title: z.string().min(1),
  summary: z.string(),
  status: RunStatus,
  started_at: z.string().datetime(),
  completed_at: z.string().datetime().optional(),
  output_dir: z.string().min(1).optional(),
  related_demo_id: z.string().min(1).optional(),
  related_plan_id: z.string().min(1).optional(),
  related_skill_id: z.string().min(1).optional(),
  related_pack_id: z.string().min(1).optional(),
  primary_artifact_refs: z.array(z.string().min(1)),
  supporting_artifact_refs: z.array(z.string().min(1)),
  debug_artifact_refs: z.array(z.string().min(1)),
  pinned: z.boolean().default(false),
  updated_at: z.string().datetime().optional(),
}).strict();

export const RunIndex = z.object({
  schema_version: z.literal("open-lagrange.runs.v1"),
  runs: z.array(RunSummary),
  latest_run_id: z.string().min(1).optional(),
  updated_at: z.string().datetime(),
}).strict();

export type ArtifactKind = z.infer<typeof ArtifactKind>;
export type ArtifactRole = z.infer<typeof ArtifactRole>;
export type ArtifactSummary = z.infer<typeof ArtifactSummary>;
export type ArtifactIndex = z.infer<typeof ArtifactIndex>;
export type RunStatus = z.infer<typeof RunStatus>;
export type WorkflowKind = z.infer<typeof WorkflowKind>;
export type RunSummary = z.infer<typeof RunSummary>;
export type RunIndex = z.infer<typeof RunIndex>;
