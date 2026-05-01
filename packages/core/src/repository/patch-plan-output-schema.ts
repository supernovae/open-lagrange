import { z } from "zod";
import { PatchPrecondition, RepositoryPatchPlan, ScopeExpansionRequest } from "./patch-plan.js";

const hash = z.string().regex(/^[a-f0-9]{64}$/);

export const ModelPatchOperation = z.discriminatedUnion("type", [
  z.object({
    operation_id: z.string().min(1),
    type: z.literal("insert_after"),
    path: z.string().min(1),
    anchor: z.string().min(1),
    content: z.string(),
    expected_sha256: hash,
    rationale: z.string().min(1),
  }).strict(),
  z.object({
    operation_id: z.string().min(1),
    type: z.literal("insert_before"),
    path: z.string().min(1),
    anchor: z.string().min(1),
    content: z.string(),
    expected_sha256: hash,
    rationale: z.string().min(1),
  }).strict(),
  z.object({
    operation_id: z.string().min(1),
    type: z.literal("replace_range"),
    path: z.string().min(1),
    start_anchor: z.string().min(1),
    end_anchor: z.string().min(1),
    replacement: z.string(),
    expected_sha256: hash,
    rationale: z.string().min(1),
  }).strict(),
  z.object({
    operation_id: z.string().min(1),
    type: z.literal("create_file"),
    path: z.string().min(1),
    content: z.string(),
    rationale: z.string().min(1),
  }).strict(),
  z.object({
    operation_id: z.string().min(1),
    type: z.literal("unified_diff"),
    path: z.string().min(1),
    diff: z.string().min(1),
    expected_sha256: hash,
    rationale: z.string().min(1),
  }).strict(),
  z.object({
    operation_id: z.string().min(1),
    type: z.literal("full_replacement"),
    path: z.string().min(1),
    content: z.string(),
    expected_sha256: hash.optional(),
    rationale: z.string().min(1),
  }).strict(),
]);

export const ModelPatchPlanOutput = z.object({
  patch_plan_id: z.string().min(1),
  plan_id: z.string().min(1),
  node_id: z.string().min(1),
  summary: z.string().min(1),
  rationale: z.string().min(1),
  evidence_refs: z.array(z.string().min(1)).min(1),
  operations: z.array(ModelPatchOperation).min(1),
  expected_changed_files: z.array(z.string().min(1)).min(1),
  verification_command_ids: z.array(z.string().min(1)),
  preconditions: z.array(PatchPrecondition),
  risk_level: z.enum(["read", "write", "destructive"]),
  approval_required: z.boolean(),
  confidence: z.number().min(0).max(1),
  requires_scope_expansion: z.boolean(),
  scope_expansion_request: ScopeExpansionRequest.optional(),
}).strict();

export type ModelPatchPlanOutput = z.infer<typeof ModelPatchPlanOutput>;

export function normalizeModelPatchPlanOutput(input: unknown) {
  const output = ModelPatchPlanOutput.parse(input);
  return RepositoryPatchPlan.parse({
    ...output,
    operations: output.operations.map((operation) => {
      if (operation.type === "replace_range") {
        return {
          operation_id: operation.operation_id,
          kind: "replace_range",
          relative_path: operation.path,
          expected_sha256: operation.expected_sha256,
          start_anchor: operation.start_anchor,
          end_anchor: operation.end_anchor,
          content: operation.replacement,
          rationale: operation.rationale,
        };
      }
      if (operation.type === "unified_diff") {
        return {
          operation_id: operation.operation_id,
          kind: "unified_diff",
          relative_path: operation.path,
          expected_sha256: operation.expected_sha256,
          unified_diff: operation.diff,
          rationale: operation.rationale,
        };
      }
      return {
        operation_id: operation.operation_id,
        kind: operation.type,
        relative_path: operation.path,
        ...("expected_sha256" in operation && operation.expected_sha256 ? { expected_sha256: operation.expected_sha256 } : {}),
        ...("anchor" in operation ? { anchor: operation.anchor } : {}),
        ...("content" in operation ? { content: operation.content } : {}),
        rationale: operation.rationale,
      };
    }),
  });
}
