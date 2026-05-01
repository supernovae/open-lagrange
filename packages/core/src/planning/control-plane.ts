import { mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { createArtifactSummary, registerArtifacts } from "../artifacts/artifact-viewer.js";
import { createRunSummary, registerRun } from "../artifacts/run-index.js";
import { createCapabilitySnapshotForTask } from "../capability-registry/registry.js";
import { createMockDelegationContext } from "../clients/mock-delegation.js";
import { getStateStore } from "../storage/state-store.js";
import { stableHash } from "../util/hash.js";
import { createLocalPlanArtifactStore } from "./local-plan-artifacts.js";
import { renderPlanfileMarkdown } from "./planfile-markdown.js";
import { PlanValidationError } from "./plan-errors.js";
import { createInitialPlanState, type PlanState } from "./plan-state.js";
import { Planfile, type Planfile as PlanfileType } from "./planfile-schema.js";
import { validatePlanfile, withCanonicalPlanDigest } from "./planfile-validator.js";
import { PlanRunner } from "./plan-runner.js";

export interface ApplyPlanfileInput {
  readonly planfile: unknown;
  readonly live?: boolean;
  readonly output_dir?: string;
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
  if (input.live === true) return applyLiveLocalPlanfile({ plan, now, ...(input.output_dir ? { output_dir: input.output_dir } : {}) });
  const snapshot = createCapabilitySnapshotForTask({ allowed_capabilities: [], allowed_scopes: [], max_risk_level: "read", now });
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

async function applyLiveLocalPlanfile(input: {
  readonly plan: PlanfileType;
  readonly now: string;
  readonly output_dir?: string;
}): Promise<PlanState> {
  const capabilityRefs = [...new Set(input.plan.nodes.flatMap((node) => node.allowed_capability_refs))];
  const snapshot = createCapabilitySnapshotForTask({
    allowed_capabilities: capabilityRefs,
    allowed_scopes: ["research:read", "project:read"],
    max_risk_level: "read",
    now: input.now,
  });
  const validation = validatePlanfile(input.plan, { capability_snapshot: snapshot });
  if (!validation.ok) throw new PlanValidationError(validation.issues);

  const artifactStore = createLocalPlanArtifactStore({
    plan_id: input.plan.plan_id,
    ...(input.output_dir ? { output_dir: input.output_dir } : {}),
    now: input.now,
  });
  const store = getStateStore();
  const delegationContext = createMockDelegationContext({
    goal: input.plan.goal_frame.interpreted_goal,
    project_id: input.plan.plan_id,
    workspace_id: stringContext(input.plan.execution_context, "workspace_id") ?? "workspace-local",
    delegate_id: "open-lagrange-local-plan-runner",
    allowed_scopes: ["project:read", "research:read"],
  });
  const runner = new PlanRunner({
    store,
    capability_snapshot: snapshot,
    delegation_context: {
      ...delegationContext,
      allowed_capabilities: capabilityRefs,
      max_risk_level: "read",
      task_run_id: input.plan.plan_id,
    },
    runtime_config: { artifact_store: artifactStore },
    record_artifact: artifactStore.recordArtifact,
    now: () => input.now,
  });
  let state = await runner.load(input.plan);
  state = (await runner.runToCompletion(input.plan)).state;
  const artifacts = artifactStore.flush();
  const planPath = `.open-lagrange/plans/${input.plan.plan_id}/planfile.plan.md`;
  mkdirSync(dirname(planPath), { recursive: true });
  writeFileSync(planPath, state.markdown_projection ?? renderPlanfileMarkdown(input.plan), "utf8");
  const planArtifact = createArtifactSummary({
    artifact_id: `planfile_${stableHash({ plan_id: input.plan.plan_id }).slice(0, 16)}`,
    kind: "planfile",
    title: `Planfile ${input.plan.plan_id}`,
    summary: "Planfile markdown projection for local live execution.",
    path_or_uri: planPath,
    content_type: "text/markdown",
    related_plan_id: input.plan.plan_id,
    created_at: input.now,
  });
  registerArtifacts({ artifacts: [planArtifact], now: input.now });
  registerRun({
    run: createRunSummary({
      run_id: `plan_${stableHash({ plan_id: input.plan.plan_id, now: input.now }).slice(0, 16)}`,
      workflow_kind: "plan",
      title: input.plan.goal_frame.interpreted_goal,
      summary: "Local live Planfile execution through PackRegistry and CapabilityStepRunner.",
      status: state.status === "completed" ? "completed" : state.status === "failed" ? "failed" : "yielded",
      started_at: state.created_at,
      completed_at: state.updated_at,
      output_dir: artifactStore.output_dir,
      related_plan_id: input.plan.plan_id,
      primary_artifact_refs: artifacts.filter((artifact) => artifact.kind === "research_brief").map((artifact) => artifact.artifact_id),
      supporting_artifact_refs: artifacts.filter((artifact) => artifact.kind !== "research_brief").map((artifact) => artifact.artifact_id),
      debug_artifact_refs: [],
    }),
    artifacts: [planArtifact, ...artifacts],
    now: input.now,
  });
  return store.recordPlanState({
    ...state,
    artifact_refs: [
      ...state.artifact_refs,
      ...artifacts.map((artifact) => ({
        artifact_id: artifact.artifact_id,
        kind: "capability_step_result" as const,
        path_or_uri: artifact.path_or_uri,
        summary: artifact.summary,
        created_at: artifact.created_at,
      })),
    ],
    updated_at: input.now,
  });
}

function stringContext(context: Record<string, unknown> | undefined, key: string): string | undefined {
  const value = context?.[key];
  return typeof value === "string" && value.length > 0 ? value : undefined;
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
