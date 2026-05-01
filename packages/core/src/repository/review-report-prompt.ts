import type { GoalFrame } from "../planning/goal-frame.js";
import type { Planfile } from "../planning/planfile-schema.js";
import type { RepositoryPatchArtifact } from "./patch-artifact.js";
import type { RepositoryVerificationReport } from "./verification-report.js";
import type { RepairAttempt } from "./repair-loop.js";

export function reviewReportSystemPrompt(): string {
  return [
    "Emit a ReviewReport JSON object only.",
    "Do not invent tests, command results, changed files, or risks.",
    "Do not claim verification passed unless VerificationReport says it passed.",
    "Distinguish completed work from follow-up work.",
    "Mention warnings and errors honestly.",
  ].join("\n");
}

export function buildReviewReportPrompt(input: {
  readonly goal_frame: GoalFrame;
  readonly planfile: Planfile;
  readonly changed_files: readonly string[];
  readonly patch_artifacts: readonly RepositoryPatchArtifact[];
  readonly verification_reports: readonly RepositoryVerificationReport[];
  readonly repair_attempts: readonly RepairAttempt[];
  readonly final_diff_summary: string;
  readonly known_limitations: readonly string[];
  readonly final_patch_artifact_id?: string;
  readonly now: string;
}): string {
  return JSON.stringify({
    goal_frame: input.goal_frame,
    planfile_summary: {
      plan_id: input.planfile.plan_id,
      status: input.planfile.status,
      nodes: input.planfile.nodes.map((node) => ({ id: node.id, kind: node.kind, title: node.title })),
    },
    changed_files: input.changed_files,
    patch_artifacts: input.patch_artifacts.map((artifact) => ({
      patch_artifact_id: artifact.patch_artifact_id,
      patch_plan_id: artifact.patch_plan_id,
      changed_files: artifact.changed_files,
      apply_status: artifact.apply_status,
      errors: artifact.errors,
    })),
    verification_reports: input.verification_reports.map((report) => ({
      verification_report_id: report.verification_report_id,
      passed: report.passed,
      failures: report.failures,
      command_results: report.command_results.map((result) => ({
        command_id: result.command_id,
        status: result.status,
        exit_code: result.exit_code,
      })),
    })),
    repair_attempts: input.repair_attempts,
    final_diff_summary: input.final_diff_summary,
    known_limitations: input.known_limitations,
    final_patch_artifact_id: input.final_patch_artifact_id,
    now: input.now,
  });
}

