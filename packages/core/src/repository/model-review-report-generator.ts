import { executeModelRoleCall, ModelRoleCallError } from "../models/model-route-executor.js";
import type { ModelRoleTraceContext } from "../models/model-route-executor.js";
import type { ModelRouteConfig } from "../evals/model-route-config.js";
import type { ModelUsageRecord } from "../evals/provider-usage.js";
import { RepositoryReviewReport, type RepositoryReviewReport as RepositoryReviewReportType } from "./review-report.js";
import { buildReviewReportPrompt, reviewReportSystemPrompt } from "./review-report-prompt.js";
import { ModelReviewReportOutput } from "./review-report-output-schema.js";
import type { Planfile } from "../planning/planfile-schema.js";
import type { GoalFrame } from "../planning/goal-frame.js";
import type { RepositoryPatchArtifact } from "./patch-artifact.js";
import type { RepositoryVerificationReport } from "./verification-report.js";
import type { RepairAttempt } from "./repair-loop.js";

export type ReviewReportGenerator = (input: GenerateReviewReportInput) => Promise<RepositoryReviewReportType>;

export interface GenerateReviewReportInput {
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
}

export function createModelReviewReportGenerator(input: {
  readonly route: ModelRouteConfig;
  readonly telemetry_records?: ModelUsageRecord[];
  readonly scenario_id?: string;
  readonly trace_context?: ModelRoleTraceContext;
  readonly persist_telemetry?: boolean;
}): ReviewReportGenerator {
  return async (reviewInput) => {
    const result = await executeModelRoleCall({
      role: "reviewer",
      model_ref: input.route.roles.reviewer,
      schema: ModelReviewReportOutput,
      system: reviewReportSystemPrompt(),
      prompt: buildReviewReportPrompt(reviewInput),
      trace_context: {
        ...input.trace_context,
        route_id: input.route.route_id,
        ...(input.scenario_id ? { scenario_id: input.scenario_id } : {}),
        plan_id: reviewInput.planfile.plan_id,
        node_id: "review_repo",
        output_artifact_refs: [
          ...(input.trace_context?.output_artifact_refs ?? []),
          ...(reviewInput.final_patch_artifact_id ? [reviewInput.final_patch_artifact_id] : []),
        ],
      },
      persist_telemetry: input.persist_telemetry ?? false,
    });
    input.telemetry_records?.push(result.usage_record);
    const report = RepositoryReviewReport.parse(result.object);
    const verificationFailed = reviewInput.verification_reports.some((item) => !item.passed);
    if (verificationFailed && report.verification_summary.toLowerCase().includes("passed")) {
      throw new ModelRoleCallError("MODEL_ROLE_CALL_FAILED", "ReviewReport claimed verification passed despite failed verification.");
    }
    return report;
  };
}
