import type { CapabilitySnapshot } from "../schemas/capabilities.js";
import { renderPlanfileMarkdown } from "./planfile-markdown.js";
import { PlanValidationError } from "./plan-errors.js";
import { createInitialPlanState, type PlanState, type PlanStateStore } from "./plan-state.js";
import { type Planfile, Planfile as PlanfileSchema, type PlanNode } from "./planfile-schema.js";
import { validatePlanfile, withCanonicalPlanDigest } from "./planfile-validator.js";
import { compileWorkOrder } from "./work-order-compiler.js";
import type { WorkOrder } from "./work-order.js";

export type PlanNodeHandler = (workOrder: WorkOrder, context: {
  readonly plan: Planfile;
  readonly node: PlanNode;
  readonly state: PlanState;
}) => Promise<{
  readonly status: "completed" | "failed" | "yielded" | "skipped";
  readonly artifacts?: PlanNode["artifacts"];
  readonly errors?: readonly string[];
}>;

export interface PlanRunnerHandlers {
  readonly inspect?: PlanNodeHandler;
  readonly patch?: PlanNodeHandler;
  readonly verify?: PlanNodeHandler;
  readonly review?: PlanNodeHandler;
  readonly repair?: PlanNodeHandler;
  readonly [kind: string]: PlanNodeHandler | undefined;
}

export interface PlanRunnerOptions {
  readonly store: PlanStateStore;
  readonly capability_snapshot: CapabilitySnapshot;
  readonly handlers?: PlanRunnerHandlers;
  readonly now?: () => string;
}

export class PlanRunner {
  constructor(private readonly options: PlanRunnerOptions) {}

  async load(planfile: unknown): Promise<PlanState> {
    const plan = withCanonicalPlanDigest(PlanfileSchema.parse(planfile));
    const validation = validatePlanfile(plan, { capability_snapshot: this.options.capability_snapshot });
    if (!validation.ok) throw new PlanValidationError(validation.issues);
    const now = this.now();
    const state = createInitialPlanState({
      plan_id: plan.plan_id,
      status: "pending",
      canonical_plan_digest: plan.canonical_plan_digest ?? "",
      nodes: plan.nodes.map((node) => ({ id: node.id, status: node.depends_on.length === 0 ? "ready" : "pending" })),
      artifact_refs: plan.artifact_refs,
      markdown_projection: renderPlanfileMarkdown({ ...plan, status: "pending" }),
      now,
    });
    return this.options.store.recordPlanState(state);
  }

  readyNodes(plan: Planfile, state: PlanState): readonly PlanNode[] {
    const completed = new Set(state.node_states.filter((node) => node.status === "completed" || node.status === "skipped").map((node) => node.node_id));
    const pending = new Set(state.node_states.filter((node) => node.status === "pending" || node.status === "ready").map((node) => node.node_id));
    return plan.nodes.filter((node) => pending.has(node.id) && node.depends_on.every((dependency) => completed.has(dependency)));
  }

  async runReadyNode(planfile: unknown): Promise<PlanState> {
    const plan = withCanonicalPlanDigest(PlanfileSchema.parse(planfile));
    const validation = validatePlanfile(plan, { capability_snapshot: this.options.capability_snapshot });
    if (!validation.ok) throw new PlanValidationError(validation.issues);
    const state = await this.options.store.getPlanState(plan.plan_id) ?? await this.load(plan);
    const node = this.readyNodes(plan, state)[0];
    if (!node) return state;
    const handler = this.options.handlers?.[node.kind];
    if (!handler) return this.markNode(plan, state, node, "yielded", [], [`No handler registered for ${node.kind}.`]);
    const workOrder = compileWorkOrder({ plan, node_id: node.id, capability_snapshot: this.options.capability_snapshot });
    const result = await handler(workOrder, { plan, node, state });
    return this.markNode(plan, state, node, result.status, result.artifacts ?? [], result.errors ?? []);
  }

  private async markNode(
    plan: Planfile,
    state: PlanState,
    node: PlanNode,
    status: "completed" | "failed" | "yielded" | "skipped",
    artifacts: PlanNode["artifacts"],
    errors: readonly string[],
  ): Promise<PlanState> {
    const now = this.now();
    const nodeStates = state.node_states.map((nodeState) => nodeState.node_id === node.id
      ? { ...nodeState, status, completed_at: now, artifacts, errors: [...errors] }
      : nodeState);
    const nextStatus: PlanState["status"] = status === "failed" ? "failed" : status === "yielded" ? "yielded" : nodeStates.every((item) => item.status === "completed" || item.status === "skipped") ? "completed" : "running";
    const projectedPlan = {
      ...plan,
      status: nextStatus,
      nodes: plan.nodes.map((candidate) => candidate.id === node.id ? { ...candidate, status, artifacts, errors: [...errors] } : candidate),
      artifact_refs: [...plan.artifact_refs, ...artifacts],
      updated_at: now,
    };
    return this.options.store.recordPlanState({
      ...state,
      status: nextStatus,
      node_states: nodeStates,
      artifact_refs: [...state.artifact_refs, ...artifacts],
      markdown_projection: renderPlanfileMarkdown(projectedPlan),
      updated_at: now,
    });
  }

  private now(): string {
    return this.options.now?.() ?? new Date().toISOString();
  }
}
