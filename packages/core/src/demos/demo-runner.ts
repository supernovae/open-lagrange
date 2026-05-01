import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { stableHash } from "../util/hash.js";
import { createMockDelegationContext } from "../clients/mock-delegation.js";
import { createCapabilitySnapshotForTask } from "../capability-registry/registry.js";
import { renderPlanfileMarkdown } from "../planning/planfile-markdown.js";
import { Planfile } from "../planning/planfile-schema.js";
import { withCanonicalPlanDigest } from "../planning/planfile-validator.js";
import { PlanRunner } from "../planning/plan-runner.js";
import { type PlanState, type PlanStateStore } from "../planning/plan-state.js";
import { RepositoryPatchArtifact } from "../repository/patch-artifact.js";
import { RepositoryPatchPlan } from "../repository/patch-plan.js";
import { createRepositoryWorkOrderHandlers, type RepositoryHandlerArtifact } from "../repository/repository-work-order-handlers.js";
import type { EvidenceBundle } from "../repository/evidence-bundle.js";
import { loadRepositoryWorkspace } from "../repository/workspace.js";
import { createWorktreeSession } from "../repository/worktree-manager.js";
import { exportFinalPatch } from "../repository/patch-exporter.js";
import { VerificationReport, ReviewReport } from "../schemas/repository.js";
import { deterministicSkillFrame } from "../skills/skill-frame.js";
import { parseSkillfileMarkdown } from "../skills/skillfile-parser.js";
import { generateWorkflowSkill } from "../skills/workflow-skill-generator.js";
import { createArtifactSummary, registerArtifacts, removeArtifactsByDemo } from "../artifacts/artifact-viewer.js";
import { createRunSummary, registerRun, removeRunsByDemo } from "../artifacts/run-index.js";
import type { ArtifactSummary } from "../artifacts/artifact-model.js";
import { getDemo, listDemos, type DemoDefinition } from "./demo-registry.js";

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../../../..");

export interface DemoRunInput {
  readonly demo_id: string;
  readonly dry_run?: boolean;
  readonly output_dir?: string;
  readonly index_path?: string;
  readonly run_index_path?: string;
  readonly stdout_only?: boolean;
  readonly clean?: boolean;
  readonly now?: string;
}

export interface DemoRunResult {
  readonly demo: DemoDefinition;
  readonly run_id: string;
  readonly output_dir?: string;
  readonly artifacts: readonly ArtifactSummary[];
  readonly stdout_only: boolean;
}

export async function runDemo(input: DemoRunInput): Promise<DemoRunResult> {
  const demo = getDemo(input.demo_id);
  if (!demo) throw new Error(`Unknown demo: ${input.demo_id}`);
  const now = input.now ?? new Date().toISOString();
  const run_id = runId(now);
  const baseDir = input.output_dir ? resolve(callerCwd(), input.output_dir) : join(callerCwd(), ".open-lagrange", "demos", demo.demo_id, run_id);
  const runIndexPath = input.run_index_path ?? (input.index_path ? join(dirname(resolve(callerCwd(), input.index_path)), "runs-index.json") : undefined);
  const latestPath = input.index_path ? join(dirname(resolve(callerCwd(), input.index_path)), "latest-run.json") : undefined;
  const latestSummaryPath = input.index_path ? join(dirname(resolve(callerCwd(), input.index_path)), "latest-summary.md") : undefined;
  if (input.clean) cleanDemo(demo.demo_id, {
    ...(input.index_path ? { index_path: input.index_path } : {}),
    ...(runIndexPath ? { run_index_path: runIndexPath } : {}),
    ...(latestPath ? { latest_path: latestPath } : {}),
    ...(latestSummaryPath ? { latest_summary_path: latestSummaryPath } : {}),
    now,
  });
  const live = input.dry_run === false;
  const artifacts = demo.demo_id === "repo-json-output"
    ? live
      ? await liveRepoDemo(demo, run_id, baseDir, now, input.stdout_only ?? false)
      : repoDemo(demo, run_id, baseDir, now, input.stdout_only ?? false)
    : skillDemo(demo, run_id, baseDir, now, input.stdout_only ?? false);
  if (!(input.stdout_only ?? false)) {
    registerArtifacts({ artifacts, ...(input.index_path ? { index_path: input.index_path } : {}), now });
    registerRun({
      run: createRunSummary({
        run_id,
        workflow_kind: "demo",
        title: demo.title,
        summary: demo.summary,
        status: "completed",
        started_at: now,
        completed_at: now,
        output_dir: baseDir,
        related_demo_id: demo.demo_id,
        related_plan_id: artifacts.find((artifact) => artifact.related_plan_id)?.related_plan_id,
        related_skill_id: artifacts.find((artifact) => artifact.related_skill_id)?.related_skill_id,
        primary_artifact_refs: artifacts.filter((artifact) => artifact.artifact_role === "primary_output").map((artifact) => artifact.artifact_id),
        supporting_artifact_refs: artifacts.filter((artifact) => artifact.artifact_role !== "primary_output" && artifact.artifact_role !== "debug_log").map((artifact) => artifact.artifact_id),
        debug_artifact_refs: artifacts.filter((artifact) => artifact.artifact_role === "debug_log").map((artifact) => artifact.artifact_id),
      }),
      artifacts,
      ...(runIndexPath ? { index_path: runIndexPath } : {}),
      ...(latestPath ? { latest_path: latestPath } : {}),
      ...(latestSummaryPath ? { latest_summary_path: latestSummaryPath } : {}),
      now,
    });
  }
  return { demo, run_id, ...(input.stdout_only ? {} : { output_dir: baseDir }), artifacts, stdout_only: input.stdout_only ?? false };
}

export function openDemo(demoId: string): { readonly demo: DemoDefinition; readonly path: string } {
  const demo = getDemo(demoId);
  if (!demo) throw new Error(`Unknown demo: ${demoId}`);
  return { demo, path: resolveExamplePath(demo) };
}

export { listDemos };

function repoDemo(demo: DemoDefinition, runIdValue: string, outputDir: string, now: string, stdoutOnly: boolean): readonly ArtifactSummary[] {
  const plan = repoPlanfile(now);
  const patchPlan = RepositoryPatchPlan.parse({
    patch_plan_id: `patch_plan_${stableHash({ demo: demo.demo_id, runIdValue }).slice(0, 18)}`,
    plan_id: plan.plan_id,
    node_id: "patch_repo",
    summary: "Add --json output to the fixture status command.",
    rationale: "Demo preview shows the expected bounded source change.",
    evidence_refs: ["fixture_repo_cli"],
    operations: [{
      operation_id: "op_json_status",
      kind: "full_replacement",
      relative_path: "src/cli.js",
      content: demoCliAfter(),
      rationale: "Add --json flag handling while preserving text output.",
    }],
    expected_changed_files: ["src/cli.js"],
    verification_command_ids: ["npm_run_typecheck"],
    preconditions: [{ kind: "file_absent", path: "src/cli.js", summary: "Fixture repository preview is deterministic." }],
    risk_level: "write",
    approval_required: true,
  });
  const patchArtifact = RepositoryPatchArtifact.parse({
    patch_artifact_id: `patch_artifact_${stableHash(patchPlan).slice(0, 18)}`,
    patch_plan_id: patchPlan.patch_plan_id,
    plan_id: patchPlan.plan_id,
    node_id: patchPlan.node_id,
    changed_files: ["src/cli.js"],
    unified_diff: repoDiffPreview(),
    before_hashes: {},
    after_hashes: {},
    apply_status: "already_applied",
    errors: [],
    artifact_id: `patch_artifact_${stableHash(patchPlan).slice(0, 18)}`,
    created_at: now,
  });
  const verification = VerificationReport.parse({
    results: [{ command_id: "demo_fixture_check", command: "node src/cli.js status --json", exit_code: 0, stdout_preview: "{\"status\":\"ok\"}", stderr_preview: "", duration_ms: 1, truncated: false }],
    passed: true,
    summary: "Demo verification preview passed.",
  });
  const review = ReviewReport.parse({
    pr_title: "Add JSON status output",
    pr_summary: "Adds a --json flag while preserving the existing text status output.",
    test_notes: ["Preview verification passed."],
    risk_notes: ["Demo preview only; no tracked fixture files were mutated."],
    follow_up_notes: [],
  });
  return writeArtifacts(stdoutOnly, outputDir, now, demo.demo_id, [
    { kind: "planfile", artifact_role: "primary_output", filename: "planfile.plan.md", title: "Repository Planfile", summary: "Planfile for the repository demo.", content: renderPlanfileMarkdown(plan), content_type: "text/markdown", related_plan_id: plan.plan_id },
    { kind: "patch_plan", artifact_role: "supporting_evidence", filename: "patch-plan.json", title: "PatchPlan Preview", summary: "Structured patch plan preview.", content: patchPlan, content_type: "application/json", related_plan_id: plan.plan_id },
    { kind: "patch_artifact", artifact_role: "primary_output", filename: "patch-artifact.json", title: "PatchArtifact Preview", summary: "Patch artifact preview.", content: patchArtifact, content_type: "application/json", related_plan_id: plan.plan_id },
    { kind: "verification_report", artifact_role: "primary_output", filename: "verification-report.json", title: "Verification Preview", summary: "Verification report preview.", content: verification, content_type: "application/json", related_plan_id: plan.plan_id },
    { kind: "review_report", artifact_role: "primary_output", filename: "review-report.json", title: "Review Preview", summary: "Review report preview.", content: review, content_type: "application/json", related_plan_id: plan.plan_id },
    { kind: "execution_timeline", artifact_role: "supporting_evidence", filename: "timeline.json", title: "Execution Timeline", summary: "Demo execution timeline.", content: [{ at: now, event: "dry_run_preview_created" }], content_type: "application/json", related_plan_id: plan.plan_id },
  ]);
}

async function liveRepoDemo(demo: DemoDefinition, runIdValue: string, outputDir: string, now: string, stdoutOnly: boolean): Promise<readonly ArtifactSummary[]> {
  if (stdoutOnly) throw new Error("Live repository demo writes worktree artifacts; remove --stdout-only.");
  const fixtureRepo = prepareLiveFixtureRepo(outputDir);
  const plan = repoPlanfile(now, {
    mode: "apply",
    repo_root: fixtureRepo,
    verification_command_ids: ["demo_fixture_check"],
  });
  const session = createWorktreeSession({ repo_root: fixtureRepo, plan_id: plan.plan_id, now });
  const workspace = loadRepositoryWorkspace({
    repo_root: session.worktree_path,
    workspace_id: "repo_json_output_demo",
    trace_id: `trace_${stableHash({ demo: demo.demo_id, runIdValue }).slice(0, 18)}`,
    dry_run: false,
    require_approval: false,
  });
  const delegation_context = createMockDelegationContext({
    goal: plan.goal_frame.interpreted_goal,
    project_id: plan.plan_id,
    workspace_id: workspace.workspace_id,
    delegate_id: "open-lagrange-demo-runner",
    allowed_scopes: ["project:read", "project:write", "repository:read", "repository:write", "repository:verify"],
  });
  const capability_snapshot = createCapabilitySnapshotForTask({
    allowed_capabilities: ["repo.list_files", "repo.read_file", "repo.search_text", "repo.apply_patch", "repo.run_verification", "repo.get_diff", "repo.create_review_report"],
    allowed_scopes: ["repository:read", "repository:write", "repository:verify"],
    max_risk_level: "external_side_effect",
    now,
  });
  const captured: RepositoryHandlerArtifact[] = [];
  const runner = new PlanRunner({
    store: createDemoPlanStateStore(),
    capability_snapshot,
    handlers: createRepositoryWorkOrderHandlers({
      workspace,
      delegation_context: {
        ...delegation_context,
        denied_scopes: [],
        allowed_capabilities: ["repo.list_files", "repo.read_file", "repo.search_text", "repo.apply_patch", "repo.run_verification", "repo.get_diff", "repo.create_review_report"],
        max_risk_level: "external_side_effect",
      },
      task_run_id: `${plan.plan_id}:demo`,
      snapshot_id: capability_snapshot.snapshot_id,
      create_patch_plan: ({ work_order, evidence, node_id }) => jsonOutputPatchPlan(plan.plan_id, node_id, work_order.objective, evidence, now),
      on_artifact: (artifact) => captured.push(artifact),
    }),
    now: () => now,
  });
  let state: PlanState | undefined;
  for (let index = 0; index < plan.nodes.length + 2; index += 1) {
    state = await runner.runReadyNode(plan);
    if (state.status === "completed" || state.status === "failed" || state.status === "yielded") break;
  }
  const finalPatch = exportFinalPatch(session, join(outputDir, "final.patch"));
  const timeline = [
    { at: now, event: "live_fixture_repo_created", path: fixtureRepo },
    { at: now, event: "worktree_created", path: session.worktree_path, branch: session.branch_name },
    ...(state ? [{ at: state.updated_at, event: `plan_${state.status}` }] : []),
  ];
  return writeArtifacts(false, outputDir, now, demo.demo_id, [
    { kind: "planfile", artifact_role: "primary_output", filename: "planfile.plan.md", title: "Live Repository Planfile", summary: "Planfile executed through PlanRunner and repository handlers.", content: renderPlanfileMarkdown(plan), content_type: "text/markdown", related_plan_id: plan.plan_id },
    { kind: "raw_log", artifact_role: "debug_log", filename: "worktree-session.json", title: "Worktree Session", summary: "Isolated git worktree used by the live demo.", content: session, content_type: "application/json", related_plan_id: plan.plan_id },
    ...captured.map((artifact) => demoArtifactItemForCaptured(artifact, plan.plan_id)),
    { kind: "patch_artifact", artifact_role: "primary_output", filename: "final-patch-artifact.json", title: "Final Git Patch Artifact", summary: `${finalPatch.changed_files.length} changed file(s) exported from worktree.`, content: finalPatch, content_type: "application/json", related_plan_id: plan.plan_id },
    { kind: "patch_artifact", artifact_role: "primary_output", filename: "final.patch", title: "Final Patch", summary: "Unified diff exported from the live worktree.", content: finalPatch.unified_diff, content_type: "text/x-patch", related_plan_id: plan.plan_id },
    { kind: "execution_timeline", artifact_role: "supporting_evidence", filename: "timeline.json", title: "Execution Timeline", summary: "Live demo execution timeline.", content: timeline, content_type: "application/json", related_plan_id: plan.plan_id },
  ]);
}

function skillDemo(demo: DemoDefinition, runIdValue: string, outputDir: string, now: string, stdoutOnly: boolean): readonly ArtifactSummary[] {
  const skillPath = join(resolveExamplePath(demo), "skills.md");
  const parsed = parseSkillfileMarkdown(readFileSync(skillPath, "utf8"));
  const frame = deterministicSkillFrame(parsed, now);
  const generated = generateWorkflowSkill({ frame, now });
  const brief = demo.demo_id === "skills-research-brief" ? researchBrief(now) : notesDraft(frame.interpreted_goal, now);
  const planMarkdown = generated.workflow_skill ? renderPlanfileMarkdown(generated.workflow_skill.planfile_template) : "No Planfile generated.";
  return writeArtifacts(stdoutOnly, outputDir, now, demo.demo_id, [
    { kind: "skill_frame", artifact_role: "supporting_evidence", filename: "skill-frame.json", title: "SkillFrame", summary: "Interpreted skill frame.", content: frame, content_type: "application/json", related_skill_id: frame.skill_id },
    { kind: "workflow_skill", artifact_role: "primary_output", filename: "workflow-skill.skill.md", title: "WorkflowSkill", summary: "Workflow Skill markdown artifact.", content: generated.markdown, content_type: "text/markdown", related_plan_id: generated.workflow_skill?.planfile_template.plan_id, related_skill_id: frame.skill_id },
    { kind: "planfile", artifact_role: "primary_output", filename: "planfile.plan.md", title: "Planfile Preview", summary: "Planfile preview for the workflow skill.", content: planMarkdown, content_type: "text/markdown", related_plan_id: generated.workflow_skill?.planfile_template.plan_id, related_skill_id: frame.skill_id },
    { kind: "research_brief", artifact_role: "primary_output", filename: demo.demo_id === "skills-research-brief" ? "research-brief.json" : "notes-draft.json", title: demo.demo_id === "skills-research-brief" ? "Mocked ResearchBrief" : "Notes Draft", summary: "Deterministic fixture artifact preview.", content: brief, content_type: "application/json", related_plan_id: generated.workflow_skill?.planfile_template.plan_id, related_skill_id: frame.skill_id },
    { kind: "execution_timeline", artifact_role: "supporting_evidence", filename: "timeline.json", title: "Execution Timeline", summary: "Demo execution timeline.", content: [{ at: now, event: "dry_run_preview_created" }], content_type: "application/json", related_plan_id: generated.workflow_skill?.planfile_template.plan_id, related_skill_id: frame.skill_id },
  ]);
}

interface DemoArtifactItem {
  readonly kind: ArtifactSummary["kind"];
  readonly artifact_role?: ArtifactSummary["artifact_role"];
  readonly filename: string;
  readonly title: string;
  readonly summary: string;
  readonly content: unknown;
  readonly content_type: string;
  readonly related_plan_id?: string | undefined;
  readonly related_skill_id?: string | undefined;
}

function writeArtifacts(
  stdoutOnly: boolean,
  outputDir: string,
  now: string,
  demoId: string,
  items: readonly DemoArtifactItem[],
): readonly ArtifactSummary[] {
  if (!stdoutOnly) mkdirSync(outputDir, { recursive: true });
  return items.map((item) => {
    const path = join(outputDir, item.filename);
    if (!stdoutOnly) writeFileSync(path, typeof item.content === "string" ? item.content : JSON.stringify(item.content, null, 2), "utf8");
    return createArtifactSummary({
      artifact_id: `${item.kind}_${stableHash({ demoId, filename: item.filename, now }).slice(0, 18)}`,
      kind: item.kind,
      artifact_role: item.artifact_role ?? "supporting_evidence",
      title: item.title,
      summary: item.summary,
      path_or_uri: stdoutOnly ? `memory://${demoId}/${item.filename}` : path,
      related_run_id: runId(now),
      related_demo_id: demoId,
      ...(item.related_plan_id ? { related_plan_id: item.related_plan_id } : {}),
      ...(item.related_skill_id ? { related_skill_id: item.related_skill_id } : {}),
      content_type: item.content_type,
      created_at: now,
      redacted: true,
      exportable: !stdoutOnly,
    });
  });
}

function prepareLiveFixtureRepo(outputDir: string): string {
  const fixtureRepo = join(outputDir, "fixture-repo");
  rmSync(fixtureRepo, { recursive: true, force: true });
  mkdirSync(outputDir, { recursive: true });
  cpSync(join(REPO_ROOT, "examples", "repo-json-output"), fixtureRepo, { recursive: true });
  mkdirSync(join(fixtureRepo, ".open-lagrange"), { recursive: true });
  writeFileSync(join(fixtureRepo, ".open-lagrange", "repository-policy.json"), JSON.stringify({
    allowed_paths: ["**"],
    denied_paths: [".git/**", ".env", ".env.*", "*.pem", "*.key", "id_rsa", "id_ed25519"],
    allowed_commands: [{
      command_id: "demo_fixture_check",
      executable: "node",
      args: ["src/cli.js", "status", "--json"],
      display: "node src/cli.js status --json",
    }],
    require_approval_for_write: false,
    require_approval_for_command: false,
  }, null, 2), "utf8");
  gitExec(fixtureRepo, ["init", "-b", "main"]);
  gitExec(fixtureRepo, ["config", "user.email", "demo@open-lagrange.local"]);
  gitExec(fixtureRepo, ["config", "user.name", "Open Lagrange Demo"]);
  gitExec(fixtureRepo, ["add", "."]);
  gitExec(fixtureRepo, ["commit", "-m", "Initial demo fixture"]);
  return fixtureRepo;
}

function jsonOutputPatchPlan(planId: string, nodeId: string, objective: string, evidence: EvidenceBundle, now: string) {
  const target = evidence.file_excerpts.find((file) => file.relative_path === "src/cli.js");
  if (!target) throw new Error("Live repository demo evidence did not include src/cli.js.");
  return RepositoryPatchPlan.parse({
    patch_plan_id: `repo_patch_${stableHash({ planId, nodeId, target: target.sha256, now }).slice(0, 18)}`,
    plan_id: planId,
    node_id: nodeId,
    summary: "Add --json output to the fixture status command.",
    rationale: `Apply the demo change requested by: ${objective}`,
    evidence_refs: [evidence.evidence_bundle_id],
    operations: [{
      operation_id: "op_json_status",
      kind: "full_replacement",
      relative_path: "src/cli.js",
      expected_sha256: target.sha256,
      content: demoCliAfter(),
      rationale: "Replace the tiny CLI fixture with equivalent text output plus --json handling.",
    }],
    expected_changed_files: ["src/cli.js"],
    verification_command_ids: ["demo_fixture_check"],
    preconditions: [{ kind: "file_hash", path: "src/cli.js", expected_sha256: target.sha256, summary: `src/cli.js hash matches evidence.` }],
    risk_level: "write",
    approval_required: true,
  });
}

function demoArtifactItemForCaptured(artifact: RepositoryHandlerArtifact, planId: string): DemoArtifactItem {
  if (artifact.kind === "evidence_bundle") {
    return { kind: "raw_log", artifact_role: "debug_log", filename: "evidence-bundle.json", title: "EvidenceBundle", summary: "Repository evidence collected through pack capabilities.", content: artifact.artifact, content_type: "application/json", related_plan_id: planId };
  }
  if (artifact.kind === "patch_plan") {
    return { kind: "patch_plan", artifact_role: "supporting_evidence", filename: "patch-plan.json", title: "Live PatchPlan", summary: artifact.artifact.summary, content: artifact.artifact, content_type: "application/json", related_plan_id: planId };
  }
  if (artifact.kind === "patch_artifact") {
    return { kind: "patch_artifact", artifact_role: "primary_output", filename: "patch-artifact.json", title: "Live PatchArtifact", summary: `${artifact.artifact.changed_files.length} changed file(s).`, content: artifact.artifact, content_type: "application/json", related_plan_id: planId };
  }
  if (artifact.kind === "verification_report") {
    return { kind: "verification_report", artifact_role: "primary_output", filename: "verification-report.json", title: "Live VerificationReport", summary: artifact.artifact.summary, content: artifact.artifact, content_type: "application/json", related_plan_id: planId };
  }
  if (artifact.kind === "review_report") {
    return { kind: "review_report", artifact_role: "primary_output", filename: "review-report.json", title: "Live ReviewReport", summary: artifact.artifact.pr_summary, content: artifact.artifact, content_type: "application/json", related_plan_id: planId };
  }
  return { kind: "raw_log", artifact_role: "debug_log", filename: "repair-attempt.json", title: "Repair Attempt", summary: artifact.artifact.failure_summary, content: artifact.artifact, content_type: "application/json", related_plan_id: planId };
}

function createDemoPlanStateStore(): PlanStateStore {
  const states = new Map<string, PlanState>();
  return {
    async recordPlanState(state) {
      states.set(state.plan_id, state);
      return state;
    },
    async getPlanState(planId) {
      return states.get(planId);
    },
  };
}

function gitExec(cwd: string, args: readonly string[]): string {
  return execFileSync("git", [...args], { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
}

function repoPlanfile(now: string, options: {
  readonly mode?: "dry_run" | "apply";
  readonly repo_root?: string;
  readonly verification_command_ids?: readonly string[];
} = {}) {
  const verification_command_ids = [...(options.verification_command_ids ?? ["demo_fixture_check"])];
  return withCanonicalPlanDigest(Planfile.parse({
    schema_version: "open-lagrange.plan.v1",
    plan_id: `plan_${stableHash({ demo: "repo-json-output" }).slice(0, 18)}`,
    goal_frame: {
      goal_id: "goal_repo_json_output_demo",
      original_prompt: "Add JSON output to my CLI status command.",
      interpreted_goal: "Add --json output to the fixture CLI status command.",
      acceptance_criteria: ["Text status output remains available.", "JSON status output returns {\"status\":\"ok\"}.", "Verification preview passes."],
      non_goals: ["Mutate tracked example files during dry-run."],
      assumptions: ["Fixture repository is deterministic."],
      ambiguity: { level: "low", questions: [], blocking: false },
      suggested_mode: "dry_run",
      risk_notes: ["Patch preview only."],
      created_at: now,
    },
    mode: options.mode ?? "dry_run",
    status: "draft",
    nodes: [
      planNode("frame_goal", "frame", "Frame goal", [], [], "read", false),
      planNode("inspect_repo", "inspect", "Inspect fixture repo", ["frame_goal"], ["repo.read_file"], "read", false),
      planNode("patch_repo", "patch", "Preview patch", ["inspect_repo"], ["repo.apply_patch", "repo.get_diff"], "write", true),
      { ...planNode("verify_repo", "verify", "Preview verification", ["patch_repo"], ["repo.run_verification"], "external_side_effect", true), verification_command_ids },
      planNode("review_repo", "review", "Preview review", ["verify_repo"], ["repo.create_review_report"], "read", false),
    ],
    edges: [
      { from: "frame_goal", to: "inspect_repo", reason: "goal before evidence" },
      { from: "inspect_repo", to: "patch_repo", reason: "evidence before patch" },
      { from: "patch_repo", to: "verify_repo", reason: "patch before verification" },
      { from: "verify_repo", to: "review_repo", reason: "verification before review" },
    ],
    approval_policy: { require_approval_for_risks: ["write", "destructive", "external_side_effect"] },
    verification_policy: { allowed_command_ids: verification_command_ids },
    ...(options.repo_root ? { execution_context: { repository: { repo_root: options.repo_root } } } : {}),
    artifact_refs: [],
    created_at: now,
    updated_at: now,
  }));
}

function planNode(id: string, kind: "frame" | "inspect" | "patch" | "verify" | "review", title: string, depends_on: readonly string[], caps: readonly string[], risk_level: "read" | "write" | "external_side_effect", approval_required: boolean) {
  return { id, kind, title, objective: title, description: title, depends_on: [...depends_on], allowed_capability_refs: [...caps], expected_outputs: [`${title} artifact`], acceptance_refs: ["acceptance:1"], risk_level, approval_required, status: "pending", artifacts: [], errors: [] };
}

function demoCliAfter(): string {
  return `#!/usr/bin/env node

const command = process.argv[2] ?? "status";
const json = process.argv.includes("--json");

if (command === "status") {
  console.log(json ? JSON.stringify({ status: "ok" }) : "ok");
  process.exit(0);
}

console.error(\`Unknown command: \${command}\`);
process.exit(1);
`;
}

function repoDiffPreview(): string {
  return `diff --git a/src/cli.js b/src/cli.js
--- a/src/cli.js
+++ b/src/cli.js
@@
 const command = process.argv[2] ?? "status";
+const json = process.argv.includes("--json");
 
 if (command === "status") {
-  console.log("ok");
+  console.log(json ? JSON.stringify({ status: "ok" }) : "ok");
`;
}

function researchBrief(now: string) {
  const sourceIndex = JSON.parse(readFileSync(join(REPO_ROOT, "examples", "skills-research-brief", "sources", "index.json"), "utf8")) as { sources: { source_id: string; title: string; url: string }[] };
  return {
    research_brief_id: `research_brief_${stableHash({ now }).slice(0, 18)}`,
    source_mode: "mocked",
    title: "Open Lagrange Planning Brief",
    summary: "Open Lagrange uses Planfiles and Workflow Skills to turn vague work into validated, reviewable artifacts before execution.",
    citations: sourceIndex.sources.map((source) => ({ source_id: source.source_id, title: source.title, url: source.url })),
    note: "Sources are deterministic demo fixtures; no network calls were made.",
    created_at: now,
  };
}

function notesDraft(goal: string, now: string) {
  return { draft_id: `notes_${stableHash({ goal, now }).slice(0, 18)}`, source_mode: "mocked", title: "Notes Draft", content: `Draft note for: ${goal}`, created_at: now };
}

function runId(now: string): string {
  return now.replace(/\D/g, "").slice(0, 14);
}

function cleanDemo(demoId: string, options: {
  readonly index_path?: string;
  readonly run_index_path?: string;
  readonly latest_path?: string;
  readonly latest_summary_path?: string;
  readonly now: string;
}): void {
  const path = resolve(callerCwd(), ".open-lagrange", "demos", demoId);
  if (existsSync(path)) rmSync(path, { recursive: true, force: true });
  removeArtifactsByDemo({ demo_id: demoId, ...(options.index_path ? { index_path: options.index_path } : {}), now: options.now });
  removeRunsByDemo({
    demo_id: demoId,
    ...(options.run_index_path ? { index_path: options.run_index_path } : {}),
    ...(options.latest_path ? { latest_path: options.latest_path } : {}),
    ...(options.latest_summary_path ? { latest_summary_path: options.latest_summary_path } : {}),
    now: options.now,
  });
}

function resolveExamplePath(demo: DemoDefinition): string {
  return resolve(REPO_ROOT, demo.example_path);
}

function callerCwd(): string {
  return process.env.INIT_CWD ?? process.cwd();
}
