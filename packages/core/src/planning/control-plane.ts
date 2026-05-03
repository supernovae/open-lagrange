import { mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { createArtifactSummary, registerArtifacts } from "../artifacts/artifact-viewer.js";
import { createRunSummary, registerRun } from "../artifacts/run-index.js";
import { createCapabilitySnapshotForTask } from "../capability-registry/registry.js";
import { createMockDelegationContext } from "../clients/mock-delegation.js";
import { buildRunSnapshot, createRunEvent, ReplayMode, type ReplayMode as ReplayModeType, type RunSnapshot } from "../runs/index.js";
import { getStateStore } from "../storage/state-store.js";
import { stableHash } from "../util/hash.js";
import { createLocalPlanArtifactStore } from "./local-plan-artifacts.js";
import { renderPlanfileMarkdown } from "./planfile-markdown.js";
import { PlanValidationError } from "./plan-errors.js";
import { createInitialPlanState, type PlanState } from "./plan-state.js";
import { Planfile, type Planfile as PlanfileType } from "./planfile-schema.js";
import { validatePlanfile, withCanonicalPlanDigest } from "./planfile-validator.js";
import { PlanRunner } from "./plan-runner.js";
import { getPlanBuilderSession } from "./plan-builder-session.js";

export interface ApplyPlanfileInput {
  readonly planfile: unknown;
  readonly live?: boolean;
  readonly output_dir?: string;
  readonly run_id?: string;
  readonly now?: string;
}

export interface CreateRunResult {
  readonly run_id: string;
  readonly snapshot: RunSnapshot;
  readonly state: PlanState;
}

export interface RunActionResult {
  readonly run_id: string;
  readonly status: string;
  readonly continuation_id?: string;
  readonly hatchet_run_id?: string;
  readonly snapshot?: RunSnapshot;
  readonly message: string;
}

export async function applyPlanfile(input: ApplyPlanfileInput): Promise<PlanState> {
  const now = input.now ?? new Date().toISOString();
  const parsed = Planfile.parse(input.planfile);
  const basePlan = withCanonicalPlanDigest(Planfile.parse({
    ...parsed,
    status: "validated",
    updated_at: now,
  }));
  const plan = input.live === true ? liveExecutionPlan(basePlan, now) : basePlan;
  if (input.live === true) return applyLiveLocalPlanfile({ plan, now, ...(input.output_dir ? { output_dir: input.output_dir } : {}), ...(input.run_id ? { run_id: input.run_id } : {}) });
  const snapshot = createCapabilitySnapshotForTask({ allowed_capabilities: [], allowed_scopes: [], max_risk_level: "read", now });
  const validation = validatePlanfile(plan, { capability_snapshot: snapshot });
  if (!validation.ok) throw new PlanValidationError(validation.issues);
  const runId = input.run_id ?? runIdForPlan(plan, now);
  const store = getStateStore();
  const state = createInitialPlanState({
    plan_id: plan.plan_id,
    status: "pending",
    canonical_plan_digest: plan.canonical_plan_digest ?? "",
    nodes: plan.nodes.map((node) => ({ id: node.id, status: node.depends_on.length === 0 ? "ready" : "pending" })),
    artifact_refs: plan.artifact_refs,
    markdown_projection: renderPlanfileMarkdown({ ...plan, status: "pending" }),
    now,
  });
  const recorded = await store.recordPlanState(state);
  await store.appendRunEvent({
    event_id: `evt_${stableHash({ run_id: runId, type: "run.created", now }).slice(0, 20)}`,
    run_id: runId,
    plan_id: plan.plan_id,
    type: "run.created",
    timestamp: now,
    payload: {
      plan_title: plan.goal_frame.interpreted_goal,
      node_count: plan.nodes.length,
      mode: "dry_run",
    },
  });
  return recorded;
}

export async function createRunFromPlanfile(input: ApplyPlanfileInput): Promise<CreateRunResult> {
  const now = input.now ?? new Date().toISOString();
  const parsed = Planfile.parse(input.planfile);
  const basePlan = withCanonicalPlanDigest(Planfile.parse({ ...parsed, status: "validated", updated_at: now }));
  const plan = input.live === true ? liveExecutionPlan(basePlan, now) : basePlan;
  const runId = input.run_id ?? runIdForPlan(plan, now);
  if (input.live === true) {
    const state = await prepareRunState({ plan, run_id: runId, now, mode: "live" });
    const record = await getStateStore().recordRunExecution({
      run_id: runId,
      plan_id: plan.plan_id,
      status: "pending",
      planfile: plan,
      ...(input.output_dir ? { output_dir: input.output_dir } : {}),
      created_at: now,
      updated_at: now,
    });
    const hatchet = await submitPlanRunWorkflow(runId).catch(async () => undefined);
    if (hatchet) {
      await getStateStore().recordRunExecution({ ...record, hatchet_run_id: hatchet, status: "running", updated_at: new Date().toISOString() });
    } else {
      void executeStoredRun(runId).catch(() => undefined);
    }
    const snapshot = await buildRunSnapshot({ run_id: runId, planfile: plan });
    if (!snapshot) throw new Error(`Run snapshot was not created for ${runId}.`);
    return { run_id: runId, snapshot, state };
  }
  const state = await applyPlanfile({
    planfile: plan,
    ...(input.live === undefined ? {} : { live: input.live }),
    ...(input.output_dir ? { output_dir: input.output_dir } : {}),
    now,
    run_id: runId,
  });
  const snapshot = await buildRunSnapshot({ run_id: runId, planfile: plan });
  if (!snapshot) throw new Error(`Run snapshot was not created for ${runId}.`);
  return { run_id: runId, snapshot, state };
}

export async function createRunFromBuilderSession(input: { readonly session_id: string; readonly live?: boolean; readonly output_dir?: string; readonly now?: string }): Promise<CreateRunResult> {
  const session = getPlanBuilderSession(input.session_id);
  if (!session?.current_planfile) throw new Error(`Plan Builder session ${input.session_id} does not have a current Planfile.`);
  return createRunFromPlanfile({
    planfile: session.current_planfile,
    ...(input.live === undefined ? {} : { live: input.live }),
    ...(input.output_dir ? { output_dir: input.output_dir } : {}),
    ...(input.now ? { now: input.now } : {}),
  });
}

export async function resumeRun(input: { readonly run_id: string; readonly now?: string }): Promise<RunActionResult> {
  const now = input.now ?? new Date().toISOString();
  const store = getStateStore();
  const record = await store.getRunExecution(input.run_id);
  if (!record) return { run_id: input.run_id, status: "missing", message: "Run was not found." };
  const continuationId = `cont_${stableHash({ run_id: input.run_id, kind: "resume", now }).slice(0, 16)}`;
  await store.recordRunContinuation({ continuation_id: continuationId, run_id: input.run_id, kind: "resume", status: "queued", created_at: now, updated_at: now });
  await store.appendRunEvent(createRunEvent({ run_id: input.run_id, plan_id: record.plan_id, type: "run.resume_requested", timestamp: now, payload: { continuation_id: continuationId } }));
  const hatchetRunId = await submitPlanRunContinuationWorkflow(continuationId).catch(async () => undefined);
  if (hatchetRunId) await store.recordRunContinuation({ continuation_id: continuationId, run_id: input.run_id, kind: "resume", status: "queued", hatchet_run_id: hatchetRunId, created_at: now, updated_at: new Date().toISOString() });
  else void executeRunContinuation(continuationId).catch(() => undefined);
  return actionResult({ run_id: input.run_id, status: "queued", continuation_id: continuationId, ...(hatchetRunId ? { hatchet_run_id: hatchetRunId } : {}), ...snapshotPatch(await buildRunSnapshot({ run_id: input.run_id })), message: "Run resume requested." });
}

export async function retryRunNode(input: { readonly run_id: string; readonly node_id: string; readonly replay_mode: ReplayModeType; readonly now?: string }): Promise<RunActionResult> {
  const replayMode = ReplayMode.parse(input.replay_mode);
  const now = input.now ?? new Date().toISOString();
  const store = getStateStore();
  const record = await store.getRunExecution(input.run_id);
  if (!record) return { run_id: input.run_id, status: "missing", message: "Run was not found." };
  const prior = (await store.listNodeAttempts(input.run_id, input.node_id)).at(-1);
  const attemptId = `attempt_${stableHash({ run_id: input.run_id, node_id: input.node_id, replay_mode: replayMode, now }).slice(0, 16)}`;
  const continuationId = `cont_${stableHash({ run_id: input.run_id, node_id: input.node_id, replay_mode: replayMode, now }).slice(0, 16)}`;
  await store.recordNodeAttempt({
    attempt_id: attemptId,
    run_id: input.run_id,
    node_id: input.node_id,
    replay_mode: replayMode,
    idempotency_key: replayMode === "force-new-idempotency-key" ? `${input.run_id}:${input.node_id}:${attemptId}` : `${input.run_id}:${input.node_id}:replay:${replayMode}`,
    input_artifact_refs: [],
    output_artifact_refs: [],
    ...(prior ? { previous_attempt_id: prior.attempt_id } : {}),
    status: "queued",
    created_at: now,
    updated_at: now,
  });
  await store.recordRunContinuation({ continuation_id: continuationId, run_id: input.run_id, kind: "retry", node_id: input.node_id, replay_mode: replayMode, status: "queued", created_at: now, updated_at: now });
  await store.appendRunEvent(createRunEvent({ run_id: input.run_id, plan_id: record.plan_id, type: "run.retry_requested", timestamp: now, node_id: input.node_id, payload: { continuation_id: continuationId, attempt_id: attemptId, replay_mode: replayMode } }));
  const hatchetRunId = await submitPlanNodeReplayWorkflow(continuationId).catch(async () => undefined);
  if (hatchetRunId) await store.recordRunContinuation({ continuation_id: continuationId, run_id: input.run_id, kind: "retry", node_id: input.node_id, replay_mode: replayMode, status: "queued", hatchet_run_id: hatchetRunId, created_at: now, updated_at: new Date().toISOString() });
  else void executeRunContinuation(continuationId).catch(() => undefined);
  return actionResult({ run_id: input.run_id, status: "queued", continuation_id: continuationId, ...(hatchetRunId ? { hatchet_run_id: hatchetRunId } : {}), ...snapshotPatch(await buildRunSnapshot({ run_id: input.run_id })), message: "Run retry requested." });
}

export async function cancelRun(input: { readonly run_id: string; readonly now?: string }): Promise<RunActionResult> {
  const now = input.now ?? new Date().toISOString();
  const store = getStateStore();
  const record = await store.getRunExecution(input.run_id);
  if (!record) return { run_id: input.run_id, status: "missing", message: "Run was not found." };
  const continuationId = `cont_${stableHash({ run_id: input.run_id, kind: "cancel", now }).slice(0, 16)}`;
  await store.recordRunExecution({ ...record, status: "cancel_requested", cancel_requested_at: now, last_continuation_id: continuationId, updated_at: now });
  await store.recordRunContinuation({ continuation_id: continuationId, run_id: input.run_id, kind: "cancel", status: "queued", created_at: now, updated_at: now });
  await store.appendRunEvent(createRunEvent({ run_id: input.run_id, plan_id: record.plan_id, type: "run.cancel_requested", timestamp: now, payload: { continuation_id: continuationId } }));
  const hatchetRunId = await submitPlanRunCancelWorkflow(continuationId).catch(async () => undefined);
  if (hatchetRunId) await store.recordRunContinuation({ continuation_id: continuationId, run_id: input.run_id, kind: "cancel", status: "queued", hatchet_run_id: hatchetRunId, created_at: now, updated_at: new Date().toISOString() });
  else await executeRunCancellation(continuationId);
  return actionResult({ run_id: input.run_id, status: "queued", continuation_id: continuationId, ...(hatchetRunId ? { hatchet_run_id: hatchetRunId } : {}), ...snapshotPatch(await buildRunSnapshot({ run_id: input.run_id })), message: "Run cancellation requested." });
}

export async function executeStoredRun(runId: string): Promise<RunSnapshot | undefined> {
  const store = getStateStore();
  const record = await store.getRunExecution(runId);
  if (!record) return undefined;
  await store.recordRunExecution({ ...record, status: "running", updated_at: new Date().toISOString() });
  await executeLiveLocalPlanfile({ plan: Planfile.parse(record.planfile), run_id: runId, now: new Date().toISOString(), ...(record.output_dir ? { output_dir: record.output_dir } : {}) });
  const snapshot = await buildRunSnapshot({ run_id: runId, planfile: Planfile.parse(record.planfile) });
  const latest = await store.getRunExecution(runId);
  if (latest && snapshot) await store.recordRunExecution({ ...latest, status: snapshot.status, updated_at: new Date().toISOString() });
  return snapshot;
}

export async function executeRunContinuation(continuationId: string): Promise<RunSnapshot | undefined> {
  const store = getStateStore();
  const continuation = await store.getRunContinuation(continuationId);
  if (!continuation) return undefined;
  const record = await store.getRunExecution(continuation.run_id);
  if (!record) return undefined;
  if (continuation.kind === "cancel") return executeRunCancellation(continuationId);
  const plan = Planfile.parse(record.planfile);
  const state = await store.getPlanState(plan.plan_id);
  if (state) {
    const resetNodeIds = continuation.kind === "retry" && continuation.node_id
      ? dependentNodeIds(plan, continuation.node_id)
      : state.node_states.filter((node) => node.status === "yielded" || node.status === "failed").map((node) => node.node_id);
    await store.recordPlanState({
      ...state,
      status: "running",
      node_states: state.node_states.map((node) => resetNodeIds.includes(node.node_id)
        ? resetPlanNodeState(node, node.node_id === continuation.node_id || continuation.kind === "resume" ? "ready" : "pending", continuation.replay_mode === "reuse-artifacts")
        : node),
      updated_at: new Date().toISOString(),
    });
  }
  await store.recordRunContinuation({ ...continuation, status: "running", updated_at: new Date().toISOString() });
  const snapshot = await executeStoredRun(continuation.run_id);
  await store.recordRunContinuation({ ...continuation, status: snapshot?.status === "failed" ? "failed" : "completed", updated_at: new Date().toISOString() });
  return snapshot;
}

export async function executeRunCancellation(continuationId: string): Promise<RunSnapshot | undefined> {
  const store = getStateStore();
  const continuation = await store.getRunContinuation(continuationId);
  if (!continuation) return undefined;
  const record = await store.getRunExecution(continuation.run_id);
  if (!record) return undefined;
  const now = new Date().toISOString();
  await store.recordRunExecution({ ...record, status: "cancelled", updated_at: now });
  await store.recordRunContinuation({ ...continuation, status: "completed", updated_at: now });
  await store.appendRunEvent(createRunEvent({ run_id: record.run_id, plan_id: record.plan_id, type: "run.cancelled", timestamp: now, payload: { continuation_id: continuationId } }));
  return buildRunSnapshot({ run_id: record.run_id, planfile: Planfile.parse(record.planfile) });
}

export async function executeLiveLocalPlanfile(input: {
  readonly plan: PlanfileType;
  readonly now: string;
  readonly output_dir?: string;
  readonly run_id?: string;
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
  const runId = input.run_id ?? runIdForPlan(input.plan, input.now);
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
    run_id: runId,
    emit_run_event: store.appendRunEvent.bind(store),
    now: () => input.now,
  });
  const state = (await runner.runToCompletion(input.plan)).state;
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
      run_id: runId,
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

const applyLiveLocalPlanfile = executeLiveLocalPlanfile;

function actionResult(input: {
  readonly run_id: string;
  readonly status: string;
  readonly message: string;
  readonly continuation_id?: string;
  readonly hatchet_run_id?: string;
  readonly snapshot?: RunSnapshot;
}): RunActionResult {
  return {
    run_id: input.run_id,
    status: input.status,
    message: input.message,
    ...(input.continuation_id ? { continuation_id: input.continuation_id } : {}),
    ...(input.hatchet_run_id ? { hatchet_run_id: input.hatchet_run_id } : {}),
    ...(input.snapshot ? { snapshot: input.snapshot } : {}),
  };
}

function snapshotPatch(snapshot: RunSnapshot | undefined): { readonly snapshot?: RunSnapshot } {
  return snapshot ? { snapshot } : {};
}

async function prepareRunState(input: { readonly plan: PlanfileType; readonly run_id: string; readonly now: string; readonly mode: "live" | "dry_run" }): Promise<PlanState> {
  const snapshot = createCapabilitySnapshotForTask({
    allowed_capabilities: input.plan.nodes.flatMap((node) => node.allowed_capability_refs),
    allowed_scopes: ["research:read", "project:read"],
    max_risk_level: "read",
    now: input.now,
  });
  const validation = validatePlanfile(input.plan, { capability_snapshot: snapshot });
  if (!validation.ok) throw new PlanValidationError(validation.issues);
  const state = createInitialPlanState({
    plan_id: input.plan.plan_id,
    status: "pending",
    canonical_plan_digest: input.plan.canonical_plan_digest ?? "",
    nodes: input.plan.nodes.map((node) => ({ id: node.id, status: node.depends_on.length === 0 ? "ready" : "pending" })),
    artifact_refs: input.plan.artifact_refs,
    markdown_projection: renderPlanfileMarkdown({ ...input.plan, status: "pending" }),
    now: input.now,
  });
  const store = getStateStore();
  const recorded = await store.recordPlanState(state);
  await store.appendRunEvent(createRunEvent({
    run_id: input.run_id,
    plan_id: input.plan.plan_id,
    type: "run.created",
    timestamp: input.now,
    payload: { plan_title: input.plan.goal_frame.interpreted_goal, node_count: input.plan.nodes.length, mode: input.mode },
  }));
  return recorded;
}

function resetPlanNodeState(node: PlanState["node_states"][number], status: PlanState["node_states"][number]["status"], reuseArtifacts: boolean): PlanState["node_states"][number] {
  return {
    node_id: node.node_id,
    status,
    ...(node.started_at ? { started_at: node.started_at } : {}),
    artifacts: reuseArtifacts ? node.artifacts : [],
    errors: [],
  };
}

function dependentNodeIds(plan: PlanfileType, nodeId: string): string[] {
  const result = new Set<string>([nodeId]);
  let changed = true;
  while (changed) {
    changed = false;
    for (const node of plan.nodes) {
      if (!result.has(node.id) && node.depends_on.some((dependency) => result.has(dependency))) {
        result.add(node.id);
        changed = true;
      }
    }
  }
  return [...result];
}

async function submitPlanRunWorkflow(runId: string): Promise<string> {
  if (!process.env.HATCHET_CLIENT_TOKEN) throw new Error("Hatchet is not configured.");
  const { planRunWorkflow } = await import("../workflows/plan-run-workflow.js");
  const ref = await planRunWorkflow.runNoWait({ run_id: runId }, { additionalMetadata: { run_id: runId } });
  return await ref.runId;
}

async function submitPlanRunContinuationWorkflow(continuationId: string): Promise<string> {
  if (!process.env.HATCHET_CLIENT_TOKEN) throw new Error("Hatchet is not configured.");
  const { planRunContinuationWorkflow } = await import("../workflows/plan-run-continuation.js");
  const ref = await planRunContinuationWorkflow.runNoWait({ continuation_id: continuationId }, { additionalMetadata: { continuation_id: continuationId } });
  return await ref.runId;
}

async function submitPlanNodeReplayWorkflow(continuationId: string): Promise<string> {
  if (!process.env.HATCHET_CLIENT_TOKEN) throw new Error("Hatchet is not configured.");
  const { planNodeReplayWorkflow } = await import("../workflows/plan-node-replay.js");
  const ref = await planNodeReplayWorkflow.runNoWait({ continuation_id: continuationId }, { additionalMetadata: { continuation_id: continuationId } });
  return await ref.runId;
}

async function submitPlanRunCancelWorkflow(continuationId: string): Promise<string> {
  if (!process.env.HATCHET_CLIENT_TOKEN) throw new Error("Hatchet is not configured.");
  const { planRunCancelWorkflow } = await import("../workflows/plan-run-cancel.js");
  const ref = await planRunCancelWorkflow.runNoWait({ continuation_id: continuationId }, { additionalMetadata: { continuation_id: continuationId } });
  return await ref.runId;
}

function liveExecutionPlan(plan: PlanfileType, now: string): PlanfileType {
  return withCanonicalPlanDigest(Planfile.parse({
    ...plan,
    mode: "apply",
    status: "validated",
    goal_frame: {
      ...plan.goal_frame,
      suggested_mode: "apply_with_approval",
    },
    nodes: plan.nodes.map((node) => ({
      ...node,
      execution_mode: node.execution_mode === undefined || node.execution_mode === "dry_run" ? "live" : node.execution_mode,
    })),
    updated_at: now,
  }));
}

function runIdForPlan(plan: PlanfileType, now: string): string {
  return `plan_${stableHash({ plan_id: plan.plan_id, digest: plan.canonical_plan_digest, now }).slice(0, 16)}`;
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
