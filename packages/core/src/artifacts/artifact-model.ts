import { z } from "zod";

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
  "patch_plan",
  "patch_artifact",
  "verification_report",
  "review_report",
  "research_brief",
  "approval_request",
  "execution_timeline",
  "raw_log",
]);

export const ArtifactSummary = z.object({
  artifact_id: z.string().min(1),
  kind: ArtifactKind,
  title: z.string().min(1),
  summary: z.string(),
  path_or_uri: z.string().min(1),
  created_at: z.string().datetime(),
  updated_at: z.string().datetime().optional(),
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
  validation_status: z.string().min(1).optional(),
  redaction_status: z.enum(["redacted", "not_redacted", "unknown"]).optional(),
  redacted: z.boolean(),
  exportable: z.boolean(),
  content_type: z.string().min(1).optional(),
  size_bytes: z.number().int().min(0).optional(),
}).strict();

export const ArtifactIndex = z.object({
  schema_version: z.literal("open-lagrange.artifacts.v1"),
  artifacts: z.array(ArtifactSummary),
  updated_at: z.string().datetime(),
}).strict();

export type ArtifactKind = z.infer<typeof ArtifactKind>;
export type ArtifactSummary = z.infer<typeof ArtifactSummary>;
export type ArtifactIndex = z.infer<typeof ArtifactIndex>;
