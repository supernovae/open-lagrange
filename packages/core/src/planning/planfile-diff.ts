import { z } from "zod";
import { derivePlanRequirements } from "./plan-requirements.js";
import { PlanEdge, PlanNode, type PlanEdge as PlanEdgeType, type Planfile, type PlanNode as PlanNodeType } from "./planfile-schema.js";

export const PlanfileStructuredDiff = z.object({
  nodes_added: z.array(PlanNode),
  nodes_removed: z.array(PlanNode),
  nodes_changed: z.array(z.object({
    node_id: z.string().min(1),
    changed_fields: z.array(z.string().min(1)),
    before: z.record(z.string(), z.unknown()),
    after: z.record(z.string(), z.unknown()),
  }).strict()),
  edges_added: z.array(PlanEdge),
  edges_removed: z.array(PlanEdge),
  capabilities_added: z.array(z.string().min(1)),
  capabilities_removed: z.array(z.string().min(1)),
  requirements_changed: z.array(z.object({
    kind: z.enum(["pack", "provider", "credential", "permission", "approval", "runtime"]),
    before: z.unknown(),
    after: z.unknown(),
  }).strict()),
  risk_changes: z.array(z.object({
    target: z.string().min(1),
    before: z.string().min(1),
    after: z.string().min(1),
    increased: z.boolean(),
  }).strict()),
  approval_changes: z.array(z.object({
    target: z.string().min(1),
    before: z.unknown(),
    after: z.unknown(),
  }).strict()),
  schedule_changed: z.object({
    before: z.unknown(),
    after: z.unknown(),
  }).strict().optional(),
  parameters_changed: z.array(z.object({
    name: z.string().min(1),
    before: z.unknown(),
    after: z.unknown(),
  }).strict()).optional(),
}).strict();

export type PlanfileStructuredDiff = z.infer<typeof PlanfileStructuredDiff>;

export function diffPlanfiles(previous: Planfile, next: Planfile): PlanfileStructuredDiff {
  const previousNodes = new Map(previous.nodes.map((node) => [node.id, node]));
  const nextNodes = new Map(next.nodes.map((node) => [node.id, node]));
  const nodesAdded = next.nodes.filter((node) => !previousNodes.has(node.id));
  const nodesRemoved = previous.nodes.filter((node) => !nextNodes.has(node.id));
  const nodesChanged = next.nodes.flatMap((node) => {
    const before = previousNodes.get(node.id);
    if (!before) return [];
    const changedFields = changedNodeFields(before, node);
    if (changedFields.length === 0) return [];
    return [{
      node_id: node.id,
      changed_fields: changedFields,
      before: partialNode(before, changedFields),
      after: partialNode(node, changedFields),
    }];
  });
  const previousEdges = new Set(previous.edges.map(edgeKey));
  const nextEdges = new Set(next.edges.map(edgeKey));
  const edgesAdded = next.edges.filter((edge) => !previousEdges.has(edgeKey(edge)));
  const edgesRemoved = previous.edges.filter((edge) => !nextEdges.has(edgeKey(edge)));
  const previousCapabilities = capabilityRefs(previous);
  const nextCapabilities = capabilityRefs(next);
  const requirementsChanged = requirementChanges(previous, next);
  const riskChanges = [
    ...nodesAdded.map((node) => riskChange(node.id, "none", node.risk_level)),
    ...next.nodes.flatMap((node) => {
      const before = previousNodes.get(node.id);
      return before && before.risk_level !== node.risk_level ? [riskChange(node.id, before.risk_level, node.risk_level)] : [];
    }),
  ];
  const approvalChanges = next.nodes.flatMap((node) => {
    const before = previousNodes.get(node.id);
    return before && before.approval_required !== node.approval_required
      ? [{ target: node.id, before: before.approval_required, after: node.approval_required }]
      : [];
  });
  const schedule = scheduleValue(previous);
  const nextSchedule = scheduleValue(next);
  const parameters = parameterChanges(previous, next);
  return PlanfileStructuredDiff.parse({
    nodes_added: nodesAdded,
    nodes_removed: nodesRemoved,
    nodes_changed: nodesChanged,
    edges_added: edgesAdded,
    edges_removed: edgesRemoved,
    capabilities_added: [...nextCapabilities].filter((capability) => !previousCapabilities.has(capability)).sort(),
    capabilities_removed: [...previousCapabilities].filter((capability) => !nextCapabilities.has(capability)).sort(),
    requirements_changed: requirementsChanged,
    risk_changes: riskChanges,
    approval_changes: approvalChanges,
    ...(sameJson(schedule, nextSchedule) ? {} : { schedule_changed: { before: schedule, after: nextSchedule } }),
    ...(parameters.length > 0 ? { parameters_changed: parameters } : {}),
  });
}

export function hasStructuredDiffChanges(diff: PlanfileStructuredDiff): boolean {
  return diff.nodes_added.length > 0
    || diff.nodes_removed.length > 0
    || diff.nodes_changed.length > 0
    || diff.edges_added.length > 0
    || diff.edges_removed.length > 0
    || diff.capabilities_added.length > 0
    || diff.capabilities_removed.length > 0
    || diff.requirements_changed.length > 0
    || diff.risk_changes.length > 0
    || diff.approval_changes.length > 0
    || Boolean(diff.schedule_changed)
    || Boolean(diff.parameters_changed?.length);
}

function changedNodeFields(previous: PlanNodeType, next: PlanNodeType): string[] {
  return Object.keys(next).filter((key) => !sameJson((previous as unknown as Record<string, unknown>)[key], (next as unknown as Record<string, unknown>)[key])).sort();
}

function partialNode(node: PlanNodeType, fields: readonly string[]): Partial<PlanNodeType> {
  return Object.fromEntries(fields.map((field) => [field, (node as unknown as Record<string, unknown>)[field]])) as Partial<PlanNodeType>;
}

function edgeKey(edge: PlanEdgeType): string {
  return JSON.stringify([edge.from, edge.to, edge.reason]);
}

function capabilityRefs(planfile: Planfile): Set<string> {
  return new Set(planfile.nodes.flatMap((node) => node.allowed_capability_refs));
}

function requirementChanges(previous: Planfile, next: Planfile): PlanfileStructuredDiff["requirements_changed"] {
  const before = derivePlanRequirements({ planfile: previous });
  const after = derivePlanRequirements({ planfile: next });
  return [
    change("pack", before.required_packs, after.required_packs),
    change("provider", before.required_providers, after.required_providers),
    change("credential", before.required_credentials, after.required_credentials),
    change("permission", before.permissions, after.permissions),
    change("approval", before.approval_requirements, after.approval_requirements),
    change("runtime", before.portability_level, after.portability_level),
  ].filter((item): item is PlanfileStructuredDiff["requirements_changed"][number] => Boolean(item));
}

function change(kind: PlanfileStructuredDiff["requirements_changed"][number]["kind"], before: unknown, after: unknown): PlanfileStructuredDiff["requirements_changed"][number] | undefined {
  return sameJson(before, after) ? undefined : { kind, before, after };
}

function riskChange(target: string, before: string, after: string): PlanfileStructuredDiff["risk_changes"][number] {
  return { target, before, after, increased: riskRank(after) > riskRank(before) };
}

function riskRank(value: string): number {
  if (value === "read" || value === "none") return 0;
  if (value === "write") return 1;
  if (value === "external_side_effect") return 2;
  if (value === "destructive") return 3;
  return 0;
}

function scheduleValue(planfile: Planfile): unknown {
  const context = record(planfile.execution_context);
  return context?.schedule_intent;
}

function parameterChanges(previous: Planfile, next: Planfile): NonNullable<PlanfileStructuredDiff["parameters_changed"]> {
  const before = record(record(previous.execution_context)?.parameters) ?? {};
  const after = record(record(next.execution_context)?.parameters) ?? {};
  const keys = [...new Set([...Object.keys(before), ...Object.keys(after)])].sort();
  return keys.flatMap((name) => sameJson(before[name], after[name]) ? [] : [{ name, before: before[name], after: after[name] }]);
}

function record(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : undefined;
}

function sameJson(left: unknown, right: unknown): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}
