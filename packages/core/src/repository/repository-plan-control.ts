import { mkdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { stableHash } from "../util/hash.js";
import { createMockDelegationContext } from "../clients/mock-delegation.js";
import { createCapabilitySnapshotForTask } from "../capability-registry/registry.js";
import { generateGoalFrame } from "../planning/goal-frame.js";
import { renderPlanfileMarkdown } from "../planning/planfile-markdown.js";
import { createArtifactRef } from "../planning/plan-artifacts.js";
import { PlanRunner } from "../planning/plan-runner.js";
import { getStateStore } from "../storage/state-store.js";
import { Planfile, type Planfile as PlanfileType } from "../planning/planfile-schema.js";
import { validatePlanfile, withCanonicalPlanDigest } from "../planning/planfile-validator.js";
import { loadRepositoryWorkspace } from "./workspace.js";
import { createWorktreeSession, cleanupWorktreeSession } from "./worktree-manager.js";
import { WorktreeSession } from "./worktree-session.js";
import { createRepositoryWorkOrderHandlers } from "./repository-work-order-handlers.js";
import { exportFinalPatch } from "./patch-exporter.js";

export interface CreateRepositoryPlanfileInput {
  readonly repo_root: string;
  readonly goal: string;
  readonly dry_run?: boolean;
  readonly workspace_id?: string;
  readonly verification_command_ids?: readonly string[];
  readonly now?: string;
}

export async function createRepositoryPlanfile(input: CreateRepositoryPlanfileInput): Promise<{
  readonly planfile: PlanfileType;
  readonly markdown: string;
  readonly path: string;
}> {
  const now = input.now ?? new Date().toISOString();
  const repoRoot = resolve(input.repo_root);
  const goalFrame = await generateGoalFrame({ original_prompt: input.goal, now });
  const plan_id = `repo_plan_${stableHash({ repoRoot, goal: input.goal }).slice(0, 18)}`;
  const verification_command_ids = [...(input.verification_command_ids ?? ["npm_run_typecheck"])];
  const planfile = withCanonicalPlanDigest(Planfile.parse({
    schema_version: "open-lagrange.plan.v1",
    plan_id,
    goal_frame: goalFrame,
    mode: input.dry_run === false ? "apply" : "dry_run",
    status: "draft",
    nodes: [
      node("frame_goal", "frame", "Frame repository goal", input.goal, [], [], "read", false),
      node("inspect_repo", "inspect", "Inspect repository evidence", "Collect bounded repository evidence for the change.", ["frame_goal"], ["repo.list_files", "repo.search_text", "repo.read_file"], "read", false),
      node("design_change", "design", "Design bounded change", "Create a design decision from evidence without file writes.", ["inspect_repo"], [], "read", false),
      node("patch_repo", "patch", "Apply structured patch", "Produce and apply a validated repository PatchPlan in an isolated worktree.", ["design_change"], ["repo.propose_patch", "repo.apply_patch"], "write", true),
      { ...node("verify_repo", "verify", "Verify patch", "Run allowlisted verification against the worktree.", ["patch_repo"], ["repo.run_verification"], "external_side_effect", true), verification_command_ids },
      node("repair_repo", "repair", "Bounded repair", "Attempt bounded repair if verification fails.", ["verify_repo"], ["repo.propose_patch", "repo.apply_patch", "repo.run_verification"], "write", true, true),
      node("review_repo", "review", "Review repository result", "Create review report from patch and verification artifacts.", ["verify_repo"], ["repo.create_review_report", "repo.get_diff"], "read", false),
      node("finalize_repo", "finalize", "Export final patch", "Export final git patch artifact and final report.", ["review_repo"], ["repo.get_diff"], "read", false),
    ],
    edges: [
      { from: "frame_goal", to: "inspect_repo", reason: "goal before evidence" },
      { from: "inspect_repo", to: "design_change", reason: "evidence before design" },
      { from: "design_change", to: "patch_repo", reason: "design before patch" },
      { from: "patch_repo", to: "verify_repo", reason: "patch before verification" },
      { from: "verify_repo", to: "repair_repo", reason: "failed verification may repair" },
      { from: "verify_repo", to: "review_repo", reason: "verification before review" },
      { from: "review_repo", to: "finalize_repo", reason: "review before final patch" },
    ],
    approval_policy: { require_approval_for_risks: ["write", "destructive", "external_side_effect"] },
    verification_policy: { allowed_command_ids: verification_command_ids },
    execution_context: {
      repository: {
        repo_root: repoRoot,
        workspace_id: input.workspace_id,
        verification_command_ids,
      },
    },
    artifact_refs: [],
    created_at: now,
    updated_at: now,
  }));
  const path = join(repoRoot, ".open-lagrange", "plans", `${planfile.plan_id}.md`);
  mkdirSync(dirname(path), { recursive: true });
  return { planfile, markdown: renderPlanfileMarkdown(planfile), path };
}

export async function applyRepositoryPlanfile(input: {
  readonly planfile: unknown;
  readonly allow_dirty_base?: boolean;
  readonly retain_on_failure?: boolean;
  readonly now?: string;
}) {
  const now = input.now ?? new Date().toISOString();
  const plan = withCanonicalPlanDigest(Planfile.parse(input.planfile));
  const repoRoot = repositoryRootFromPlan(plan);
  const session = createWorktreeSession({
    repo_root: repoRoot,
    plan_id: plan.plan_id,
    ...(input.allow_dirty_base === undefined ? {} : { allow_dirty_base: input.allow_dirty_base }),
    ...(input.retain_on_failure === undefined ? {} : { retain_on_failure: input.retain_on_failure }),
    now,
  });
  const base_delegation_context = createMockDelegationContext({
    goal: plan.goal_frame.interpreted_goal,
    project_id: plan.plan_id,
    workspace_id: workspaceIdFromPlan(plan) ?? "workspace-local",
    delegate_id: "open-lagrange-repository-plan",
    allowed_scopes: ["project:read", "project:summarize", "project:write", "repository:read", "repository:write", "repository:verify"],
  });
  const delegation_context = {
    ...base_delegation_context,
    denied_scopes: [],
    allowed_capabilities: ["repo.list_files", "repo.read_file", "repo.search_text", "repo.propose_patch", "repo.apply_patch", "repo.run_verification", "repo.get_diff", "repo.create_review_report"],
    max_risk_level: "external_side_effect" as const,
  };
  const workspaceId = workspaceIdFromPlan(plan);
  const workspace = loadRepositoryWorkspace({
    repo_root: session.worktree_path,
    ...(workspaceId ? { workspace_id: workspaceId } : {}),
    trace_id: delegation_context.trace_id,
    dry_run: false,
    require_approval: true,
  });
  const capability_snapshot = createCapabilitySnapshotForTask({
    allowed_capabilities: ["repo.list_files", "repo.read_file", "repo.search_text", "repo.propose_patch", "repo.apply_patch", "repo.run_verification", "repo.get_diff", "repo.create_review_report"],
    allowed_scopes: ["repository:read", "repository:write", "repository:verify"],
    max_risk_level: "external_side_effect",
    now,
  });
  const validation = validatePlanfile(plan, { capability_snapshot });
  if (!validation.ok) throw new Error(validation.issues.map((issue) => issue.message).join("; "));
  const store = getStateStore();
  const runner = new PlanRunner({
    store,
    capability_snapshot,
    handlers: createRepositoryWorkOrderHandlers({
      workspace,
      delegation_context,
      task_run_id: plan.plan_id,
      snapshot_id: capability_snapshot.snapshot_id,
    }),
  });
  let state = await runner.load(plan);
  state = await store.recordPlanState({
    ...state,
    artifact_refs: [
      ...state.artifact_refs,
      createArtifactRef({
        artifact_id: "worktree_session",
        kind: "worktree_session",
        path_or_uri: session.worktree_path,
        summary: `${session.base_commit} ${session.base_ref}`,
        created_at: session.created_at,
      }),
    ],
    updated_at: now,
  });
  for (let index = 0; index < plan.nodes.length + 2; index += 1) {
    const next = await runner.runReadyNode(plan);
    state = next;
    if (next.status === "completed" || next.status === "failed" || next.status === "yielded") break;
  }
  const finalPatch = exportFinalPatch(session);
  return store.recordPlanState({
    ...state,
    artifact_refs: [
      ...state.artifact_refs,
      createArtifactRef({
        artifact_id: "final_patch",
        kind: "final_patch_artifact",
        path_or_uri: `memory://${plan.plan_id}/final.patch`,
        summary: `${finalPatch.changed_files.length} changed file(s) from ${finalPatch.base_commit}`,
        created_at: finalPatch.created_at,
      }),
    ],
    updated_at: new Date().toISOString(),
  });
}

export async function getRepositoryPlanStatus(planId: string) {
  return getStateStore().getPlanState(planId);
}

export async function exportRepositoryPlanPatch(planId: string, outputPath?: string) {
  const state = await getStateStore().getPlanState(planId);
  if (!state) return undefined;
  const session = sessionFromState(planId, state.artifact_refs);
  const patch = exportFinalPatch(session, outputPath);
  return patch;
}

export async function cleanupRepositoryPlan(planId: string) {
  const state = await getStateStore().getPlanState(planId);
  if (!state) return { plan_id: planId, cleaned: false };
  cleanupWorktreeSession(sessionFromState(planId, state.artifact_refs));
  return { plan_id: planId, cleaned: true };
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

function workspaceIdFromPlan(plan: PlanfileType): string | undefined {
  const repository = plan.execution_context?.repository;
  if (!repository || typeof repository !== "object") return undefined;
  const value = (repository as { workspace_id?: unknown }).workspace_id;
  return typeof value === "string" ? value : undefined;
}

function sessionFromState(planId: string, refs: readonly { readonly artifact_id: string; readonly kind?: string; readonly path_or_uri: string; readonly summary: string }[]): WorktreeSession {
  const ref = refs.find((item) => item.kind === "worktree_session" || item.artifact_id === "worktree_session");
  if (!ref) throw new Error(`Worktree session was not found for plan ${planId}.`);
  const [base_commit = "", base_ref = "main"] = ref.summary.split(" ");
  const repoRoot = ref.path_or_uri.split("/.open-lagrange/worktrees/")[0] ?? "";
  return WorktreeSession.parse({
    plan_id: planId,
    repo_root: repoRoot,
    worktree_path: ref.path_or_uri,
    branch_name: `ol/${planId}`,
    base_ref,
    base_commit,
    retain_on_failure: true,
    created_at: new Date().toISOString(),
  });
}
