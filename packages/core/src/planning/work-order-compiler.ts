import { stableHash } from "../util/hash.js";
import type { CapabilitySnapshot } from "../schemas/capabilities.js";
import { WorkOrder, type WorkOrder as WorkOrderType } from "./work-order.js";
import type { Planfile, PlanNode } from "./planfile-schema.js";

export interface CompileWorkOrderInput {
  readonly plan: Planfile;
  readonly node_id: string;
  readonly capability_snapshot: CapabilitySnapshot;
  readonly relevant_evidence?: readonly string[];
  readonly latest_failures?: readonly string[];
  readonly max_attempts?: number;
}

export function compileWorkOrder(input: CompileWorkOrderInput): WorkOrderType {
  const node = input.plan.nodes.find((candidate) => candidate.id === input.node_id);
  if (!node) throw new Error(`Unknown plan node: ${input.node_id}`);
  const dependencyArtifacts = input.plan.nodes
    .filter((candidate) => node.depends_on.includes(candidate.id))
    .flatMap((candidate) => candidate.artifacts.map((artifact) => artifact.path_or_uri));
  return WorkOrder.parse({
    work_order_id: `work_order_${stableHash({ plan_id: input.plan.plan_id, node_id: node.id, status: node.status }).slice(0, 18)}`,
    plan_id: input.plan.plan_id,
    node_id: node.id,
    phase: node.kind,
    objective: node.objective,
    acceptance_criteria: acceptanceForNode(input.plan, node),
    non_goals: input.plan.goal_frame.non_goals,
    assumptions: input.plan.goal_frame.assumptions,
    constraints: constraintsForNode(node),
    allowed_capability_snapshot: filteredSnapshot(input.capability_snapshot, node.allowed_capability_refs),
    input_artifacts: dependencyArtifacts,
    required_output_schema: { type: "object" },
    relevant_evidence: [...(input.relevant_evidence ?? [])],
    latest_failures: [...(input.latest_failures ?? node.errors)],
    max_attempts: input.max_attempts ?? 1,
    model_role_hint: roleHint(node.kind),
  });
}

function acceptanceForNode(plan: Planfile, node: PlanNode): readonly string[] {
  if (node.acceptance_refs.length === 0) return plan.goal_frame.acceptance_criteria;
  return node.acceptance_refs.map((ref) => {
    const match = /^acceptance:(\d+)$/.exec(ref);
    if (match) return plan.goal_frame.acceptance_criteria[Number(match[1]) - 1] ?? ref;
    return plan.goal_frame.acceptance_criteria.find((criterion) => criterion === ref) ?? ref;
  });
}

function constraintsForNode(node: PlanNode): readonly string[] {
  return [
    `risk_level:${node.risk_level}`,
    `approval_required:${node.approval_required}`,
    ...node.allowed_capability_refs.map((ref) => `capability:${ref}`),
    ...(node.verification_command_ids ?? []).map((commandId) => `verification_command:${commandId}`),
  ];
}

function filteredSnapshot(snapshot: CapabilitySnapshot, refs: readonly string[]): CapabilitySnapshot {
  if (refs.length === 0) return { ...snapshot, capabilities: [] };
  const refSet = new Set(refs);
  return {
    ...snapshot,
    capabilities: snapshot.capabilities.filter((capability) =>
      refSet.has(capability.capability_name)
      || refSet.has(`${capability.endpoint_id}.${capability.capability_name}`)
      || refSet.has(`${capability.endpoint_id}.${capability.capability_name}@${capability.capability_digest}`),
    ),
  };
}

function roleHint(kind: PlanNode["kind"]): WorkOrderType["model_role_hint"] {
  if (kind === "review") return "reviewer";
  if (kind === "repair") return "repair";
  if (kind === "finalize") return "summarizer";
  if (kind === "frame" || kind === "design" || kind === "analyze") return "planner";
  return "implementer";
}
