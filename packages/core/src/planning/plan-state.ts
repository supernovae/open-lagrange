import { z } from "zod";
import { PlanArtifactRef } from "./plan-artifacts.js";
import { PlanNodeStatus, PlanStatus } from "./planfile-schema.js";

export const PlanNodeState = z.object({
  node_id: z.string().min(1),
  status: PlanNodeStatus,
  started_at: z.string().datetime().optional(),
  completed_at: z.string().datetime().optional(),
  artifacts: z.array(PlanArtifactRef),
  errors: z.array(z.string()),
}).strict();

export const PlanState = z.object({
  plan_id: z.string().min(1),
  status: PlanStatus,
  canonical_plan_digest: z.string().regex(/^[a-f0-9]{64}$/),
  node_states: z.array(PlanNodeState),
  artifact_refs: z.array(PlanArtifactRef),
  markdown_projection: z.string().optional(),
  created_at: z.string().datetime(),
  updated_at: z.string().datetime(),
}).strict();

export type PlanNodeState = z.infer<typeof PlanNodeState>;
export type PlanState = z.infer<typeof PlanState>;

export interface PlanStateStore {
  readonly recordPlanState: (state: PlanState) => Promise<PlanState>;
  readonly getPlanState: (planId: string) => Promise<PlanState | undefined>;
}

const planStates = new Map<string, PlanState>();

export const inMemoryPlanStateStore: PlanStateStore = {
  async recordPlanState(state) {
    const parsed = PlanState.parse(state);
    planStates.set(parsed.plan_id, parsed);
    return parsed;
  },
  async getPlanState(planId) {
    return planStates.get(planId);
  },
};

export function createInitialPlanState(input: {
  readonly plan_id: string;
  readonly status: PlanState["status"];
  readonly canonical_plan_digest: string;
  readonly nodes: readonly { readonly id: string; readonly status: PlanNodeStatus }[];
  readonly artifact_refs: PlanState["artifact_refs"];
  readonly markdown_projection?: string;
  readonly now: string;
}): PlanState {
  return PlanState.parse({
    plan_id: input.plan_id,
    status: input.status,
    canonical_plan_digest: input.canonical_plan_digest,
    node_states: input.nodes.map((node) => ({
      node_id: node.id,
      status: node.status,
      artifacts: [],
      errors: [],
    })),
    artifact_refs: input.artifact_refs,
    ...(input.markdown_projection ? { markdown_projection: input.markdown_projection } : {}),
    created_at: input.now,
    updated_at: input.now,
  });
}
