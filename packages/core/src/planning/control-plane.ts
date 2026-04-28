import { buildCapabilitySnapshot } from "../schemas/capabilities.js";
import { getStateStore } from "../storage/state-store.js";
import { renderPlanfileMarkdown } from "./planfile-markdown.js";
import { PlanValidationError } from "./plan-errors.js";
import { createInitialPlanState, type PlanState } from "./plan-state.js";
import { Planfile, type Planfile as PlanfileType } from "./planfile-schema.js";
import { validatePlanfile, withCanonicalPlanDigest } from "./planfile-validator.js";

export interface ApplyPlanfileInput {
  readonly planfile: unknown;
  readonly now?: string;
}

export async function applyPlanfile(input: ApplyPlanfileInput): Promise<PlanState> {
  const now = input.now ?? new Date().toISOString();
  const parsed = Planfile.parse(input.planfile);
  const plan = withCanonicalPlanDigest(Planfile.parse({
    ...parsed,
    status: "validated",
    updated_at: now,
  }));
  const snapshot = buildCapabilitySnapshot([], now);
  const validation = validatePlanfile(plan, { capability_snapshot: snapshot });
  if (!validation.ok) throw new PlanValidationError(validation.issues);
  const state = createInitialPlanState({
    plan_id: plan.plan_id,
    status: "pending",
    canonical_plan_digest: plan.canonical_plan_digest ?? "",
    nodes: plan.nodes.map((node) => ({ id: node.id, status: node.depends_on.length === 0 ? "ready" : "pending" })),
    artifact_refs: plan.artifact_refs,
    markdown_projection: renderPlanfileMarkdown({ ...plan, status: "pending" }),
    now,
  });
  return getStateStore().recordPlanState(state);
}

export async function getPlanExecutionStatus(planId: string): Promise<PlanState | undefined> {
  return getStateStore().getPlanState(planId);
}

export async function approvePlan(planId: string, decidedBy: string, reason: string, now = new Date().toISOString()): Promise<PlanState | undefined> {
  const state = await getStateStore().getPlanState(planId);
  if (!state) return undefined;
  return getStateStore().recordPlanState({
    ...state,
    markdown_projection: `${state.markdown_projection ?? ""}\n\nApproval recorded by ${decidedBy}: ${reason}\n`,
    updated_at: now,
  });
}

export async function rejectPlan(planId: string, decidedBy: string, reason: string, now = new Date().toISOString()): Promise<PlanState | undefined> {
  const state = await getStateStore().getPlanState(planId);
  if (!state) return undefined;
  return getStateStore().recordPlanState({
    ...state,
    status: "yielded",
    markdown_projection: `${state.markdown_projection ?? ""}\n\nRejection recorded by ${decidedBy}: ${reason}\n`,
    updated_at: now,
  });
}
