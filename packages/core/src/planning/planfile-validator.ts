import { ZodError } from "zod";
import { stableHash, stableStringify } from "../util/hash.js";
import type { CapabilitySnapshot } from "../schemas/capabilities.js";
import type { PlanValidationIssue, PlanValidationResult } from "./plan-errors.js";
import { Planfile, type Planfile as PlanfileType, type PlanNode } from "./planfile-schema.js";

const SAFE_NODE_ID = /^[a-z][a-z0-9_-]{1,63}$/;
const WRITE_RISKS = new Set(["write", "destructive", "external_side_effect"]);

export interface PlanValidationOptions {
  readonly capability_snapshot?: CapabilitySnapshot;
}

export function validatePlanfile(input: unknown, options: PlanValidationOptions = {}): PlanValidationResult {
  const issues: PlanValidationIssue[] = [];
  let plan: PlanfileType;
  try {
    plan = Planfile.parse(input);
  } catch (error) {
    if (error instanceof ZodError) {
      return {
        ok: false,
        issues: error.issues.map((issue) => ({
          code: "INVALID_SCHEMA",
          message: issue.message,
          severity: "error",
          path: issue.path.filter((item): item is string | number => typeof item === "string" || typeof item === "number"),
        })),
      };
    }
    throw error;
  }

  const nodeIds = new Set<string>();
  for (const node of plan.nodes) {
    if (!SAFE_NODE_ID.test(node.id)) {
      issues.push({ code: "INVALID_NODE_ID", message: `Node id is not safe: ${node.id}`, severity: "error", path: ["nodes", node.id] });
    }
    if (nodeIds.has(node.id)) {
      issues.push({ code: "DUPLICATE_NODE_ID", message: `Duplicate node id: ${node.id}`, severity: "error", path: ["nodes", node.id] });
    }
    nodeIds.add(node.id);
  }

  for (const node of plan.nodes) {
    for (const dependency of node.depends_on) {
      if (!nodeIds.has(dependency)) {
        issues.push({ code: "MISSING_DEPENDENCY", message: `${node.id} depends on missing node ${dependency}`, severity: "error", path: ["nodes", node.id, "depends_on"] });
      }
    }
  }
  for (const edge of plan.edges) {
    if (!nodeIds.has(edge.from) || !nodeIds.has(edge.to)) {
      issues.push({ code: "MISSING_DEPENDENCY", message: `Edge references missing node: ${edge.from} -> ${edge.to}`, severity: "error", path: ["edges"] });
    }
  }

  if (hasCycle(plan.nodes)) {
    issues.push({ code: "CYCLE_DETECTED", message: "Plan DAG contains a cycle.", severity: "error", path: ["nodes"] });
  }

  for (const node of unreachableNodes(plan.nodes)) {
    if (!node.optional) {
      issues.push({ code: "UNREACHABLE_NODE", message: `Node is not reachable from the frame node: ${node.id}`, severity: "error", path: ["nodes", node.id] });
    }
  }

  const capabilityRefs = options.capability_snapshot ? capabilityReferenceSet(options.capability_snapshot) : undefined;
  if (capabilityRefs) {
    for (const node of plan.nodes) {
      for (const capabilityRef of node.allowed_capability_refs) {
        if (!capabilityRefs.has(capabilityRef)) {
          issues.push({ code: "UNKNOWN_CAPABILITY", message: `${node.id} references unknown capability ${capabilityRef}`, severity: "error", path: ["nodes", node.id, "allowed_capability_refs"] });
        }
      }
    }
  }

  const approvalRisks = new Set(plan.approval_policy.require_approval_for_risks);
  const allowFixtures = plan.execution_context?.allow_fixtures === true || plan.execution_context?.context === "demo" || plan.execution_context?.context === "eval";
  const allowMock = plan.execution_context?.context === "test";
  for (const node of plan.nodes) {
    const nodeMode = node.execution_mode ?? "live";
    if (nodeMode === "fixture" && !allowFixtures) {
      issues.push({ code: "INVALID_PLAN", message: `${node.id} requests fixture execution outside demo/eval context. Use --allow-fixtures or an explicit demo/eval context.`, severity: "error", path: ["nodes", node.id, "execution_mode"] });
    }
    if (nodeMode === "mock" && !allowMock) {
      issues.push({ code: "INVALID_PLAN", message: `${node.id} requests mock execution outside test context.`, severity: "error", path: ["nodes", node.id, "execution_mode"] });
    }
    if ((approvalRisks.has(node.risk_level) || WRITE_RISKS.has(node.risk_level)) && !node.approval_required) {
      issues.push({ code: "APPROVAL_REQUIRED", message: `${node.id} requires approval for ${node.risk_level} risk.`, severity: "error", path: ["nodes", node.id, "approval_required"] });
    }
    if (node.risk_level === "destructive" && (!node.approval_required || plan.approval_policy.explicit_destructive_goal !== true)) {
      issues.push({ code: "DESTRUCTIVE_GOAL_NOT_EXPLICIT", message: `${node.id} is destructive without an explicit destructive-goal policy flag.`, severity: "error", path: ["nodes", node.id, "risk_level"] });
    }
    if (node.kind === "verify") {
      for (const commandId of node.verification_command_ids ?? []) {
        if (!plan.verification_policy.allowed_command_ids.includes(commandId)) {
          issues.push({ code: "UNKNOWN_VERIFICATION_COMMAND", message: `${node.id} uses command outside verification policy: ${commandId}`, severity: "error", path: ["nodes", node.id, "verification_command_ids"] });
        }
      }
    }
    if (node.kind === "patch" && node.acceptance_refs.length === 0) {
      issues.push({ code: "PATCH_ACCEPTANCE_MISSING", message: `${node.id} must reference acceptance criteria.`, severity: "error", path: ["nodes", node.id, "acceptance_refs"] });
    }
  }

  return { ok: issues.every((issue) => issue.severity !== "error"), issues };
}

export function canonicalPlanDigest(plan: PlanfileType): string {
  const { canonical_plan_digest: _digest, updated_at: _updatedAt, ...stable } = plan;
  return stableHash(JSON.parse(stableStringify(stable)) as unknown);
}

export function withCanonicalPlanDigest(plan: PlanfileType): PlanfileType {
  return Planfile.parse({ ...plan, canonical_plan_digest: canonicalPlanDigest(plan) });
}

function hasCycle(nodes: readonly PlanNode[]): boolean {
  const byId = new Map(nodes.map((node) => [node.id, node]));
  const visiting = new Set<string>();
  const visited = new Set<string>();
  const visit = (id: string): boolean => {
    if (visited.has(id)) return false;
    if (visiting.has(id)) return true;
    const node = byId.get(id);
    if (!node) return false;
    visiting.add(id);
    for (const dependency of node.depends_on) {
      if (visit(dependency)) return true;
    }
    visiting.delete(id);
    visited.add(id);
    return false;
  };
  return nodes.some((node) => visit(node.id));
}

function unreachableNodes(nodes: readonly PlanNode[]): readonly PlanNode[] {
  const byId = new Map(nodes.map((node) => [node.id, node]));
  const children = new Map<string, string[]>();
  for (const node of nodes) {
    for (const dependency of node.depends_on) {
      children.set(dependency, [...(children.get(dependency) ?? []), node.id]);
    }
  }
  const roots = nodes.filter((node) => node.kind === "frame");
  const start = roots.length > 0 ? roots : nodes.filter((node) => node.depends_on.length === 0);
  const reached = new Set<string>();
  const stack = start.map((node) => node.id);
  while (stack.length > 0) {
    const id = stack.pop();
    if (!id || reached.has(id)) continue;
    reached.add(id);
    for (const child of children.get(id) ?? []) stack.push(child);
  }
  return [...byId.values()].filter((node) => !reached.has(node.id));
}

function capabilityReferenceSet(snapshot: CapabilitySnapshot): Set<string> {
  const refs = new Set<string>();
  for (const capability of snapshot.capabilities) {
    refs.add(capability.capability_name);
    refs.add(`${capability.endpoint_id}.${capability.capability_name}`);
    refs.add(`${capability.endpoint_id}.${capability.capability_name}@${capability.capability_digest}`);
  }
  return refs;
}
