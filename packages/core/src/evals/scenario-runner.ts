import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { performance } from "node:perf_hooks";
import { createArtifactSummary, registerArtifacts } from "../artifacts/index.js";
import { createRepositoryPlanfile, applyRepositoryPlanfile } from "../repository/repository-plan-control.js";
import { exportFinalPatch } from "../repository/patch-exporter.js";
import { WorktreeSession } from "../repository/worktree-session.js";
import { stableHash } from "../util/hash.js";
import type { BenchmarkScenario } from "./benchmark-scenarios.js";
import type { ModelRouteConfig } from "./model-route-config.js";
import { createLiveProviderPatchPlanGenerator, createPreviewPatchPlanGenerator, hasLiveProviderForRoute } from "./live-provider-runner.js";
import { ScenarioRunMetrics } from "./live-metrics.js";
import { summarizeModelUsage } from "./provider-usage.js";
import { createScenarioWorkspace } from "./scenario-worktree.js";

export async function runScenarioRoute(input: {
  readonly eval_run_id: string;
  readonly scenario: BenchmarkScenario;
  readonly route: ModelRouteConfig;
  readonly output_dir: string;
  readonly retain_worktrees?: boolean;
  readonly now: string;
}): Promise<ScenarioRunMetrics> {
  const started = performance.now();
  if (!hasLiveProviderForRoute(input.route)) {
    return ScenarioRunMetrics.parse({
      run_id: input.eval_run_id,
      scenario_id: input.scenario.scenario_id,
      route_id: input.route.route_id,
      status: "skipped",
      patch_validated: false,
      patch_applied: false,
      final_patch_applies_to_base: false,
      verification_passed: false,
      success_criteria_passed: false,
      validation_failures_count: 0,
      verification_failures_count: 0,
      repair_attempts: 0,
      scope_expansion_requests: 0,
      approvals_required: 0,
      changed_files: [],
      forbidden_files_changed: [],
      final_patch_size_bytes: 0,
      capability_calls_count: 0,
      repeated_action_count: 0,
      wall_clock_ms: Math.round(performance.now() - started),
      model_usage: summarizeModelUsage([]),
      artifact_refs: [],
      error_codes: ["MODEL_PROVIDER_UNAVAILABLE"],
    });
  }
  const workspace = createScenarioWorkspace({
    scenario: input.scenario,
    ...(input.retain_worktrees === undefined ? {} : { retain: input.retain_worktrees }),
  });
  try {
    const created = await createRepositoryPlanfile({
      repo_root: workspace.repo_root,
      goal: input.scenario.goal,
      dry_run: true,
      verification_command_ids: input.scenario.verification_command_ids,
      now: input.now,
    });
    const liveGenerator = input.route.authoritative_apply ? createLiveProviderPatchPlanGenerator(input.route) : undefined;
    const patchPlanGenerator = input.route.authoritative_apply ? liveGenerator?.generator : createPreviewPatchPlanGenerator(input.route);
    const status = await applyRepositoryPlanfile({
      planfile: created.planfile,
      ...(patchPlanGenerator ? { patch_plan_generator: patchPlanGenerator } : {}),
      retain_on_failure: input.retain_worktrees ?? false,
      now: input.now,
    });
    mkdirSync(join(input.output_dir, "patches"), { recursive: true });
    const patchPath = join(input.output_dir, "patches", `${input.scenario.scenario_id}-${input.route.route_id}.patch`);
    const patch = status.worktree_session ? exportFinalPatch(WorktreeSession.parse(status.worktree_session), patchPath) : undefined;
    if (patch) {
      registerArtifacts({
        artifacts: [createArtifactSummary({
          artifact_id: `${input.eval_run_id}_${input.scenario.scenario_id}_${input.route.route_id}_patch`,
          kind: "final_patch_artifact",
          title: `${input.scenario.title} final patch`,
          summary: `${patch.changed_files.length} changed file(s).`,
          path_or_uri: patchPath,
          content_type: "text/x-diff",
          created_at: input.now,
        })],
        now: input.now,
      });
    }
    const patchText = patch?.unified_diff ?? "";
    const changedFiles = [...(patch?.changed_files ?? status.changed_files)];
    const forbidden = forbiddenFiles(input.scenario).filter((path) => changedFiles.includes(path));
    const criteriaPassed = evaluateSuccessCriteria({
      scenario: input.scenario,
      changed_files: changedFiles,
      patch_text: patchText,
      verification_passed: status.verification_report_ids.length > 0 && status.errors.length === 0,
      patch_applies: patch?.validation_status === "pass",
    });
    return ScenarioRunMetrics.parse({
      run_id: input.eval_run_id,
      scenario_id: input.scenario.scenario_id,
      route_id: input.route.route_id,
      status: status.status === "yielded" ? "yielded" : criteriaPassed && status.status === "completed" ? "passed" : "failed",
      patch_validated: status.patch_validation_report_ids.length > 0 && status.errors.length === 0,
      patch_applied: status.patch_artifact_ids.length > 0,
      final_patch_applies_to_base: patch?.validation_status === "pass",
      verification_passed: status.verification_report_ids.length > 0 && status.errors.length === 0,
      success_criteria_passed: criteriaPassed,
      validation_failures_count: status.errors.filter((error) => /validation|precondition|policy/i.test(error)).length,
      verification_failures_count: status.errors.filter((error) => /verification|typecheck|test|lint|build/i.test(error)).length,
      repair_attempts: status.repair_attempt_ids.length,
      scope_expansion_requests: status.scope_expansion_request_ids.length,
      approvals_required: status.scope_expansion_requests.filter((request) => request.approval_status === "requested").length,
      changed_files: changedFiles,
      forbidden_files_changed: forbidden,
      final_patch_size_bytes: Buffer.byteLength(patchText, "utf8"),
      capability_calls_count: status.artifact_refs.filter((ref) => ref.includes("capability_step")).length,
      repeated_action_count: repeatedCount(status.patch_plan_ids),
      wall_clock_ms: Math.round(performance.now() - started),
      model_usage: summarizeModelUsage(liveGenerator?.usage_records ?? []),
      artifact_refs: status.artifact_refs,
      error_codes: [...new Set(status.errors.map((error) => stableHash(error).slice(0, 12)))],
    });
  } catch (caught) {
    return ScenarioRunMetrics.parse({
      run_id: input.eval_run_id,
      scenario_id: input.scenario.scenario_id,
      route_id: input.route.route_id,
      status: "errored",
      patch_validated: false,
      patch_applied: false,
      final_patch_applies_to_base: false,
      verification_passed: false,
      success_criteria_passed: false,
      validation_failures_count: 0,
      verification_failures_count: 0,
      repair_attempts: 0,
      scope_expansion_requests: 0,
      approvals_required: 0,
      changed_files: [],
      forbidden_files_changed: [],
      final_patch_size_bytes: 0,
      capability_calls_count: 0,
      repeated_action_count: 0,
      wall_clock_ms: Math.round(performance.now() - started),
      model_usage: summarizeModelUsage([]),
      artifact_refs: [],
      error_codes: [caught instanceof Error ? caught.message : String(caught)],
    });
  } finally {
    workspace.cleanup();
  }
}

function evaluateSuccessCriteria(input: {
  readonly scenario: BenchmarkScenario;
  readonly changed_files: readonly string[];
  readonly patch_text: string;
  readonly verification_passed: boolean;
  readonly patch_applies: boolean;
}): boolean {
  const criteria = input.scenario.success_criteria;
  if (criteria.patch_applies && !input.patch_applies) return false;
  if (criteria.verification_must_pass && !input.verification_passed) return false;
  for (const file of criteria.required_files_changed ?? input.scenario.expected_changed_files) {
    if (!input.changed_files.includes(file)) return false;
  }
  for (const file of criteria.forbidden_files_changed ?? forbiddenFiles(input.scenario)) {
    if (input.changed_files.includes(file)) return false;
  }
  for (const pattern of criteria.required_output_patterns ?? []) {
    if (!new RegExp(pattern, "i").test(input.patch_text)) return false;
  }
  for (const pattern of criteria.forbidden_output_patterns ?? []) {
    if (new RegExp(pattern, "i").test(input.patch_text)) return false;
  }
  return true;
}

function forbiddenFiles(scenario: BenchmarkScenario): readonly string[] {
  return scenario.success_criteria.forbidden_files_changed ?? scenario.forbidden_changed_files ?? [];
}

function repeatedCount(values: readonly string[]): number {
  return values.length - new Set(values).size;
}
