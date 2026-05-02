import { stableHash, stableStringify } from "../util/hash.js";
import { Planfile, type Planfile as PlanfileType } from "./planfile-schema.js";

export type CanonicalPlanfile = ReturnType<typeof canonicalPlanObject>;

export function canonicalPlanObject(planfile: PlanfileType): Record<string, unknown> {
  const parsed = Planfile.parse(planfile);
  const lifecycle = parsed.lifecycle
    ? stripUndefined({
      builder_session_id: parsed.lifecycle.builder_session_id,
      questions_answered: parsed.lifecycle.questions_answered,
      assumptions: parsed.lifecycle.assumptions,
    })
    : undefined;
  return stripUndefined({
    schema_version: parsed.schema_version,
    plan_id: parsed.plan_id,
    goal_frame: parsed.goal_frame,
    mode: parsed.mode,
    nodes: parsed.nodes.map((node) => stripUndefined({
      id: node.id,
      kind: node.kind,
      title: node.title,
      objective: node.objective,
      description: node.description,
      depends_on: node.depends_on,
      allowed_capability_refs: node.allowed_capability_refs,
      execution_mode: node.execution_mode,
      expected_outputs: node.expected_outputs,
      acceptance_refs: node.acceptance_refs,
      risk_level: node.risk_level,
      approval_required: node.approval_required,
      optional: node.optional,
      verification_command_ids: node.verification_command_ids,
    })),
    edges: parsed.edges,
    approval_policy: parsed.approval_policy,
    verification_policy: parsed.verification_policy,
    execution_context: parsed.execution_context,
    lifecycle,
    artifact_refs: parsed.artifact_refs,
  });
}

export function canonicalPlanJson(planfile: PlanfileType): string {
  return stableStringify(canonicalPlanObject(planfile));
}

export function canonicalPlanSha256(planfile: PlanfileType): string {
  return stableHash(canonicalPlanObject(planfile));
}

function stripUndefined<T extends Record<string, unknown>>(record: T): Record<string, unknown> {
  return Object.fromEntries(Object.entries(record).filter(([, value]) => value !== undefined));
}
