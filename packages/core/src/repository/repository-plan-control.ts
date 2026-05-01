import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { createArtifactSummary, registerArtifacts } from "../artifacts/index.js";
import { createRunSummary, registerRun } from "../artifacts/run-index.js";
import { getStateStore } from "../storage/state-store.js";
import { stableHash } from "../util/hash.js";
import { renderPlanfileMarkdown } from "../planning/planfile-markdown.js";
import { Planfile, type Planfile as PlanfileType } from "../planning/planfile-schema.js";
import { inMemoryPlanStateStore } from "../planning/plan-state.js";
import { validatePlanfile, withCanonicalPlanDigest } from "../planning/planfile-validator.js";
import { createWorktreeSession, cleanupWorktreeSession } from "./worktree-manager.js";
import { WorktreeSession } from "./worktree-session.js";
import { RepositoryPlanRunner } from "./repository-plan-runner.js";
import { readRepositoryPlanStatus, writeRepositoryPlanStatus } from "./repository-status.js";
import { exportFinalPatch } from "./patch-exporter.js";
import type { PatchPlanGenerator } from "./model-patch-plan-generator.js";
import type { ReviewReportGenerator } from "./model-review-report-generator.js";
import { collectRepositoryMetadataSummary, deterministicRepositoryGoalFrame, fallbackPlanningTelemetry, generateModelGoalFrame, type PlanningGenerationMode } from "./model-goal-frame-generator.js";
import { generateModelRepositoryPlanfile } from "./model-planfile-generator.js";
import { detectVerificationPolicy, VerificationPolicy, type VerificationCommand } from "./verification-policy.js";
import type { ModelRouteConfig } from "../evals/model-route-config.js";
import type { ModelUsageRecord } from "../evals/provider-usage.js";
import { ModelRoleCallError } from "../models/model-route-executor.js";
import { loadApprovedScopeExpansionForResume, markScopeExpansionApplied } from "./scope-expansion-resume.js";
import { markScopeExpansionRequest } from "./scope-expansion.js";

export interface CreateRepositoryPlanfileInput {
  readonly repo_root: string;
  readonly goal: string;
  readonly dry_run?: boolean;
  readonly workspace_id?: string;
  readonly verification_command_ids?: readonly string[];
  readonly planning_mode?: PlanningGenerationMode;
  readonly model_route?: ModelRouteConfig;
  readonly telemetry_records?: ModelUsageRecord[];
  readonly scenario_id?: string;
  readonly now?: string;
}

export async function createRepositoryPlanfile(input: CreateRepositoryPlanfileInput): Promise<{
  readonly planfile: PlanfileType;
  readonly markdown: string;
  readonly path: string;
}> {
  const now = input.now ?? new Date().toISOString();
  const repoRoot = resolve(input.repo_root);
  const planningMode = input.planning_mode ?? "deterministic";
  const metadata = collectRepositoryMetadataSummary(repoRoot);
  const goalFrame = await createGoalFrameForMode({
    repo_root: repoRoot,
    goal: input.goal,
    mode: planningMode,
    metadata,
    ...(input.model_route ? { route: input.model_route } : {}),
    ...(input.telemetry_records ? { telemetry_records: input.telemetry_records } : {}),
    ...(input.scenario_id ? { scenario_id: input.scenario_id } : {}),
    now,
  });
  const plan_id = `repo_plan_${stableHash({ repoRoot, goal: input.goal }).slice(0, 18)}`;
  const verification_command_ids = [...(input.verification_command_ids ?? ["npm_run_typecheck"])];
  const deterministicPlanfile = () => withCanonicalPlanDigest(Planfile.parse({
    schema_version: "open-lagrange.plan.v1",
    plan_id,
    goal_frame: goalFrame,
    mode: input.dry_run === false ? "apply" : "dry_run",
    status: "draft",
    nodes: [
      node("frame_goal", "frame", "Frame repository goal", input.goal, [], [], "read", false),
      node("inspect_repo", "inspect", "Inspect repository evidence", "Collect bounded repository evidence for the change.", ["frame_goal"], ["repo.list_files", "repo.search_text", "repo.read_file"], "read", false),
      node("design_change", "design", "Design bounded change", "Create a design decision from evidence without file writes.", ["inspect_repo"], [], "read", false),
      node("patch_repo", "patch", "Apply structured patch", "Produce and apply a validated repository PatchPlan in an isolated worktree.", ["design_change"], ["repo.propose_patch"], "write", true),
      { ...node("verify_repo", "verify", "Verify patch", "Run allowlisted verification against the worktree.", ["patch_repo"], [], "external_side_effect", true), verification_command_ids },
      node("repair_repo", "repair", "Bounded repair", "Attempt bounded repair if verification fails.", ["verify_repo"], [], "write", true, true),
      node("review_repo", "review", "Review repository result", "Create review report from patch and verification artifacts.", ["verify_repo"], [], "read", false),
      node("export_patch", "finalize", "Export final patch", "Export final git patch artifact.", ["review_repo"], [], "read", false),
    ],
    edges: [
      { from: "frame_goal", to: "inspect_repo", reason: "goal before evidence" },
      { from: "inspect_repo", to: "design_change", reason: "evidence before design" },
      { from: "design_change", to: "patch_repo", reason: "design before patch" },
      { from: "patch_repo", to: "verify_repo", reason: "patch before verification" },
      { from: "verify_repo", to: "repair_repo", reason: "failed verification may repair" },
      { from: "verify_repo", to: "review_repo", reason: "verification before review" },
      { from: "review_repo", to: "export_patch", reason: "review before final patch" },
    ],
    approval_policy: { require_approval_for_risks: ["destructive"] },
    verification_policy: { allowed_command_ids: verification_command_ids },
    execution_context: {
      repository: {
        repo_root: repoRoot,
        ...(input.workspace_id ? { workspace_id: input.workspace_id } : {}),
        verification_command_ids,
      },
    },
    artifact_refs: [],
    created_at: now,
    updated_at: now,
  }));
  const planfile = await createPlanfileForMode({
    deterministic_planfile: deterministicPlanfile,
    repo_root: repoRoot,
    goal_frame: goalFrame,
    metadata,
    plan_id,
    planning_mode: planningMode,
    ...(input.model_route ? { route: input.model_route } : {}),
    ...(input.telemetry_records ? { telemetry_records: input.telemetry_records } : {}),
    ...(input.scenario_id ? { scenario_id: input.scenario_id } : {}),
    verification_command_ids,
    ...(input.dry_run === undefined ? {} : { dry_run: input.dry_run }),
    now,
  });
  const markdown = renderPlanfileMarkdown(planfile);
  const path = join(repoRoot, ".open-lagrange", "plans", `${planfile.plan_id}.plan.md`);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, markdown, "utf8");
  const artifact = createArtifactSummary({
    artifact_id: `planfile_${planfile.plan_id}`,
    kind: "planfile",
    title: `Repository Planfile ${planfile.plan_id}`,
    summary: planfile.goal_frame.interpreted_goal,
    path_or_uri: path,
    content_type: "text/markdown",
    related_plan_id: planfile.plan_id,
    created_at: now,
  });
  registerArtifacts({ artifacts: [artifact], now });
  return { planfile, markdown, path };
}

export async function applyRepositoryPlanfile(input: {
  readonly planfile: unknown;
  readonly allow_dirty_base?: boolean;
  readonly retain_on_failure?: boolean;
  readonly patch_plan_generator?: PatchPlanGenerator;
  readonly review_report_generator?: ReviewReportGenerator;
  readonly now?: string;
}) {
  const now = input.now ?? new Date().toISOString();
  const plan = withCanonicalPlanDigest(Planfile.parse(input.planfile));
  const validation = validatePlanfile(plan);
  if (!validation.ok) throw new Error(validation.issues.map((issue) => issue.message).join("; "));
  const session = createWorktreeSession({
    repo_root: repositoryRootFromPlan(plan),
    plan_id: plan.plan_id,
    ...(input.allow_dirty_base === undefined ? {} : { allow_dirty_base: input.allow_dirty_base }),
    retain_on_failure: input.retain_on_failure ?? true,
    now,
  });
  const result = await new RepositoryPlanRunner({
    store: inMemoryPlanStateStore,
    planfile: plan,
    session,
    retain_worktree: input.retain_on_failure ?? true,
    ...(input.patch_plan_generator ? { patch_plan_generator: input.patch_plan_generator } : {}),
    ...(input.review_report_generator ? { review_report_generator: input.review_report_generator } : {}),
    now,
  }).run();
  registerRun({
    run: createRunSummary({
      run_id: `repo_${plan.plan_id}`,
      workflow_kind: "repository",
      title: plan.goal_frame.interpreted_goal,
      summary: "Repository Planfile applied through durable repository PlanRunner.",
      status: result.status.status === "completed" ? "completed" : result.status.status === "failed" ? "failed" : "yielded",
      started_at: result.status.created_at,
      completed_at: result.status.updated_at,
      output_dir: join(repositoryRootFromPlan(plan), ".open-lagrange", "runs", plan.plan_id),
      related_plan_id: plan.plan_id,
      primary_artifact_refs: result.status.final_patch_artifact_id ? [result.status.final_patch_artifact_id] : [],
      supporting_artifact_refs: result.status.artifact_refs,
      debug_artifact_refs: [],
    }),
    artifacts: result.artifacts,
    now,
  });
  return result.status;
}

export async function getRepositoryPlanStatus(planId: string) {
  return readRepositoryPlanStatus(planId);
}

export async function exportRepositoryPlanPatch(planId: string, outputPath?: string) {
  const status = readRepositoryPlanStatus(planId);
  if (!status?.worktree_session) return undefined;
  const patch = exportFinalPatch(status.worktree_session, outputPath);
  return patch;
}

export async function cleanupRepositoryPlan(planId: string) {
  const status = readRepositoryPlanStatus(planId);
  if (!status?.worktree_session) return { plan_id: planId, cleaned: false };
  const cleaned = cleanupWorktreeSession(WorktreeSession.parse(status.worktree_session));
  writeRepositoryPlanStatus({ ...status, worktree_session: cleaned, updated_at: cleaned.updated_at });
  return { plan_id: planId, cleaned: true, worktree_path: cleaned.worktree_path };
}

export async function approveApprovalRequest(input: {
  readonly approval_id: string;
  readonly reason: string;
  readonly approved_by?: string;
  readonly now?: string;
}) {
  const now = input.now ?? new Date().toISOString();
  return await getStateStore().approveRequest(input.approval_id, input.approved_by ?? "human-local", now, input.reason) ?? { approval_id: input.approval_id, status: "missing" };
}

export async function rejectApprovalRequest(input: {
  readonly approval_id: string;
  readonly reason: string;
  readonly rejected_by?: string;
  readonly now?: string;
}) {
  const now = input.now ?? new Date().toISOString();
  return await getStateStore().rejectRequest(input.approval_id, input.rejected_by ?? "human-local", now, input.reason) ?? { approval_id: input.approval_id, status: "missing" };
}

export async function approveRepositoryScopeRequest(input: {
  readonly request_id: string;
  readonly reason: string;
  readonly approved_by?: string;
  readonly now?: string;
}) {
  const now = input.now ?? new Date().toISOString();
  const decision = await getStateStore().approveRequest(input.request_id, input.approved_by ?? "human-local", now, input.reason);
  const envelope = await getStateStore().getApprovalContinuationEnvelope(input.request_id);
  if (envelope?.kind === "scope_expansion") updateScopeStatus(envelope.project_id, input.request_id, "approved", now);
  return decision ?? { request_id: input.request_id, status: "missing" };
}

export async function rejectRepositoryScopeRequest(input: {
  readonly request_id: string;
  readonly reason: string;
  readonly rejected_by?: string;
  readonly now?: string;
}) {
  const now = input.now ?? new Date().toISOString();
  const decision = await getStateStore().rejectRequest(input.request_id, input.rejected_by ?? "human-local", now, input.reason);
  const envelope = await getStateStore().getApprovalContinuationEnvelope(input.request_id);
  if (envelope?.kind === "scope_expansion") updateScopeStatus(envelope.project_id, input.request_id, "rejected", now);
  return decision ?? { request_id: input.request_id, status: "missing" };
}

export async function resumeRepositoryPlan(input: {
  readonly plan_id: string;
  readonly patch_plan_generator?: PatchPlanGenerator;
  readonly review_report_generator?: ReviewReportGenerator;
  readonly now?: string;
}) {
  const now = input.now ?? new Date().toISOString();
  const context = await loadApprovedScopeExpansionForResume(input.plan_id);
  const session = WorktreeSession.parse(context.status.worktree_session);
  const approvedStatus = updateScopeStatus(context.status.plan_id, context.request.request_id, "approved", now) ?? context.status;
  const result = await new RepositoryPlanRunner({
    store: inMemoryPlanStateStore,
    planfile: context.planfile,
    session,
    initial_status: approvedStatus,
    resume_from_node_id: context.request.node_id,
    approved_scope_request: context.request,
    expanded_files: context.requested_files,
    expanded_capabilities: context.requested_capabilities,
    expanded_verification_commands: context.requested_verification_commands,
    retain_worktree: session.retain_on_failure ?? true,
    ...(input.patch_plan_generator ? { patch_plan_generator: input.patch_plan_generator } : {}),
    ...(input.review_report_generator ? { review_report_generator: input.review_report_generator } : {}),
    now,
  }).run();
  return markScopeExpansionApplied({ status: result.status, request_id: context.request.request_id, now });
}

export function listPendingRepositoryScopeRequests(planId?: string) {
  if (!planId) return [];
  const status = readRepositoryPlanStatus(planId);
  return status?.scope_expansion_requests.filter((item) => item.request.status === "pending_approval") ?? [];
}

function updateScopeStatus(planId: string, requestId: string, approvalStatus: "approved" | "rejected", now = new Date().toISOString()) {
  const status = readRepositoryPlanStatus(planId);
  if (!status) return undefined;
  return writeRepositoryPlanStatus({
    ...status,
    scope_expansion_requests: status.scope_expansion_requests.map((item) =>
      item.approval_request_id === requestId || item.request.request_id === requestId
        ? {
            ...item,
            approval_status: approvalStatus,
            resume_status: approvalStatus === "approved" ? "ready" : "blocked",
            request: markScopeExpansionRequest(item.request, approvalStatus, now),
          }
        : item,
    ),
    updated_at: now,
  });
}

function node(
  id: string,
  kind: PlanfileType["nodes"][number]["kind"],
  title: string,
  objective: string,
  depends_on: readonly string[],
  allowed_capability_refs: readonly string[],
  risk_level: PlanfileType["nodes"][number]["risk_level"],
  approval_required: boolean,
  optional = false,
): PlanfileType["nodes"][number] {
  return {
    id,
    kind,
    title,
    objective,
    description: objective,
    depends_on: [...depends_on],
    allowed_capability_refs: [...allowed_capability_refs],
    expected_outputs: [`${title} artifact`],
    acceptance_refs: ["acceptance:1"],
    risk_level,
    approval_required,
    status: "pending",
    artifacts: [],
    errors: [],
    ...(optional ? { optional } : {}),
  };
}

function repositoryRootFromPlan(plan: PlanfileType): string {
  const repository = plan.execution_context?.repository;
  if (!repository || typeof repository !== "object" || typeof (repository as { repo_root?: unknown }).repo_root !== "string") {
    throw new Error("Repository Planfile is missing execution_context.repository.repo_root.");
  }
  return (repository as { repo_root: string }).repo_root;
}

async function createGoalFrameForMode(input: {
  readonly repo_root: string;
  readonly goal: string;
  readonly mode: PlanningGenerationMode;
  readonly route?: ModelRouteConfig;
  readonly metadata: ReturnType<typeof collectRepositoryMetadataSummary>;
  readonly telemetry_records?: ModelUsageRecord[];
  readonly scenario_id?: string;
  readonly now: string;
}) {
  if (input.mode === "deterministic") return deterministicRepositoryGoalFrame({ goal: input.goal, now: input.now });
  if (!input.route) {
    if (input.mode === "model_with_deterministic_fallback") {
      fallbackPlanningTelemetry({
        mode: input.mode,
        reason: "route unavailable",
        ...(input.telemetry_records ? { telemetry_records: input.telemetry_records } : {}),
      });
      return deterministicRepositoryGoalFrame({ goal: input.goal, now: input.now });
    }
    throw new ModelRoleCallError("MODEL_PROVIDER_UNAVAILABLE", "Model planning requires a model route.");
  }
  try {
    return await generateModelGoalFrame({
      repo_root: input.repo_root,
      original_goal: input.goal,
      repo_metadata: input.metadata,
      mode: input.scenario_id ? "eval" : "repo_plan",
      route: input.route,
      ...(input.telemetry_records ? { telemetry_records: input.telemetry_records } : {}),
      ...(input.scenario_id ? { scenario_id: input.scenario_id } : {}),
      now: input.now,
    });
  } catch (caught) {
    if (input.mode !== "model_with_deterministic_fallback") throw caught;
    fallbackPlanningTelemetry({
      route: input.route,
      mode: input.mode,
      reason: caught instanceof Error ? caught.message : String(caught),
      ...(input.telemetry_records ? { telemetry_records: input.telemetry_records } : {}),
    });
    return deterministicRepositoryGoalFrame({ goal: input.goal, now: input.now });
  }
}

async function createPlanfileForMode(input: {
  readonly deterministic_planfile: () => PlanfileType;
  readonly repo_root: string;
  readonly goal_frame: PlanfileType["goal_frame"];
  readonly metadata: ReturnType<typeof collectRepositoryMetadataSummary>;
  readonly plan_id: string;
  readonly planning_mode: PlanningGenerationMode;
  readonly route?: ModelRouteConfig;
  readonly telemetry_records?: ModelUsageRecord[];
  readonly scenario_id?: string;
  readonly verification_command_ids: readonly string[];
  readonly dry_run?: boolean;
  readonly now: string;
}): Promise<PlanfileType> {
  if (input.planning_mode === "deterministic") return input.deterministic_planfile();
  if (!input.route) {
    if (input.planning_mode === "model_with_deterministic_fallback") {
      fallbackPlanningTelemetry({
        mode: input.planning_mode,
        reason: "route unavailable",
        ...(input.telemetry_records ? { telemetry_records: input.telemetry_records } : {}),
      });
      return input.deterministic_planfile();
    }
    throw new ModelRoleCallError("MODEL_PROVIDER_UNAVAILABLE", "Model Planfile generation requires a model route.");
  }
  try {
    return await generateModelRepositoryPlanfile({
      goal_frame: input.goal_frame,
      repo_metadata: input.metadata,
      available_capabilities: { capability_refs: ["repo.list_files", "repo.search_text", "repo.read_file", "repo.propose_patch"] },
      verification_policy: verificationPolicyForPlanning(input.repo_root, input.verification_command_ids),
      planning_policy: {
        mode: input.dry_run === false ? "apply" : "dry_run",
        require_write_approval: true,
        allow_destructive_nodes: false,
      },
      route: input.route,
      plan_id: input.plan_id,
      repo_root: input.repo_root,
      ...(input.scenario_id ? { scenario_id: input.scenario_id } : {}),
      ...(input.telemetry_records ? { telemetry_records: input.telemetry_records } : {}),
      now: input.now,
    });
  } catch (caught) {
    if (input.planning_mode !== "model_with_deterministic_fallback") throw caught;
    fallbackPlanningTelemetry({
      route: input.route,
      mode: input.planning_mode,
      reason: caught instanceof Error ? caught.message : String(caught),
      ...(input.telemetry_records ? { telemetry_records: input.telemetry_records } : {}),
    });
    return input.deterministic_planfile();
  }
}

function verificationPolicyForPlanning(repoRoot: string, commandIds: readonly string[]): VerificationPolicy {
  const detected = detectVerificationPolicy(repoRoot);
  const byId = new Map(detected.allowed_commands.map((command) => [command.command_id, command]));
  const commands: VerificationCommand[] = commandIds.map((commandId) => byId.get(commandId) ?? fallbackVerificationCommand(commandId));
  return VerificationPolicy.parse({ allowed_commands: commands });
}

function fallbackVerificationCommand(commandId: string): VerificationCommand {
  const script = commandId.startsWith("npm_run_") ? commandId.slice("npm_run_".length) : commandId;
  return {
    command_id: commandId,
    display_name: `npm run ${script}`,
    executable: "npm",
    args: ["run", script],
    timeout_ms: 60_000,
    output_limit_bytes: 40_000,
  };
}
