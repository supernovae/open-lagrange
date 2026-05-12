import type { ArtifactSummary } from "../artifacts/index.js";
import { showArtifact } from "../artifacts/index.js";
import type { EvidenceBundle } from "./evidence-bundle.js";
import { EvidenceBundle as EvidenceBundleSchema } from "./evidence-bundle.js";
import type { RepositoryPatchArtifact } from "./patch-artifact.js";
import { RepositoryPatchArtifact as RepositoryPatchArtifactSchema } from "./patch-artifact.js";
import type { RepositoryPatchPlan } from "./patch-plan.js";
import { RepositoryPatchPlan as RepositoryPatchPlanSchema } from "./patch-plan.js";
import type { RepairAttempt } from "./repair-loop.js";
import { RepairAttempt as RepairAttemptSchema } from "./repair-loop.js";
import type { RepositoryReviewReport } from "./review-report.js";
import { RepositoryReviewReport as RepositoryReviewReportSchema } from "./review-report.js";
import type { RepositoryVerificationReport } from "./verification-report.js";
import { RepositoryVerificationReport as RepositoryVerificationReportSchema } from "./verification-report.js";

export interface RepositoryFileView {
  readonly path: string;
  readonly reason?: string;
  readonly line_start?: number;
  readonly line_end?: number;
  readonly artifact_ref?: string;
}

export interface RepositoryChangedFileView {
  readonly path: string;
  readonly artifact_ref?: string;
  readonly summary?: string;
}

export interface RepositoryDeniedFileView {
  readonly path: string;
  readonly reason: string;
}

export interface EvidenceBundleSummary {
  readonly evidence_bundle_id: string;
  readonly artifact_id: string;
  readonly files: readonly RepositoryFileView[];
  readonly findings: readonly string[];
  readonly notes: readonly string[];
  readonly created_at: string;
}

export interface PatchPlanSummary {
  readonly patch_plan_id: string;
  readonly artifact_id: string;
  readonly summary: string;
  readonly operations: readonly {
    readonly operation_id: string;
    readonly kind: string;
    readonly relative_path: string;
    readonly rationale: string;
  }[];
  readonly expected_changed_files: readonly string[];
  readonly evidence_refs: readonly string[];
  readonly risk_level: string;
  readonly approval_required: boolean;
  readonly validation_status?: string;
}

export interface PatchArtifactSummary {
  readonly patch_artifact_id: string;
  readonly artifact_id: string;
  readonly changed_files: readonly string[];
  readonly unified_diff: string;
  readonly apply_status: string;
  readonly error_count: number;
  readonly created_at: string;
}

export interface VerificationReportSummary {
  readonly verification_report_id: string;
  readonly artifact_id: string;
  readonly passed: boolean;
  readonly command_results: readonly {
    readonly command_id: string;
    readonly exit_code: number | null;
    readonly status: string;
    readonly stdout_preview: string;
    readonly stderr_preview: string;
    readonly duration_ms: number;
    readonly raw_artifact_id?: string;
  }[];
  readonly failures: readonly {
    readonly command_id: string;
    readonly summary: string;
    readonly stderr_preview: string;
  }[];
  readonly created_at: string;
}

export interface RepairAttemptSummary {
  readonly repair_attempt_id: string;
  readonly artifact_id?: string;
  readonly attempt: number;
  readonly failure_summary: string;
  readonly status: string;
  readonly decision: string;
  readonly decision_reason: string;
  readonly created_at: string;
}

export interface ScopeExpansionRequestSummary {
  readonly request_id: string;
  readonly approval_request_id: string;
  readonly approval_status: string;
  readonly reason: string;
  readonly requested_files: readonly string[];
  readonly requested_capabilities: readonly string[];
  readonly requested_verification_commands: readonly string[];
  readonly requested_risk_level?: string;
  readonly evidence_refs: readonly string[];
  readonly latest_failure_refs: readonly string[];
  readonly suggested_approve_command: string;
  readonly suggested_reject_command: string;
  readonly suggested_resume_command?: string;
}

export interface ReviewReportSummary {
  readonly review_report_id: string;
  readonly artifact_id: string;
  readonly status: string;
  readonly title: string;
  readonly summary: string;
  readonly changed_files: readonly string[];
  readonly verification_summary: string;
  readonly risk_notes: readonly string[];
  readonly followups: readonly string[];
  readonly final_patch_artifact_id?: string;
}

export interface FinalPatchSummary {
  readonly artifact_id: string;
  readonly changed_files: readonly string[];
  readonly unified_diff: string;
  readonly export_command: string;
  readonly apply_command: string;
}

export interface RepositoryParsedArtifacts {
  readonly evidence: readonly EvidenceBundleSummary[];
  readonly patch_plans: readonly PatchPlanSummary[];
  readonly patch_artifacts: readonly PatchArtifactSummary[];
  readonly verification_reports: readonly VerificationReportSummary[];
  readonly repair_attempts: readonly RepairAttemptSummary[];
  readonly review_report?: ReviewReportSummary;
  readonly final_patch?: FinalPatchSummary;
}

export function buildRepositoryArtifactView(input: {
  readonly plan_id: string;
  readonly artifacts: readonly ArtifactSummary[];
  readonly artifact_index_path?: string;
}): RepositoryParsedArtifacts {
  const evidence = input.artifacts.flatMap((artifact) => {
    if (artifact.kind !== "evidence_bundle") return [];
    const parsed = parseArtifact(artifact, EvidenceBundleSchema, input.artifact_index_path);
    return parsed ? [evidenceSummary(parsed)] : [];
  });
  const patchPlans = input.artifacts.flatMap((artifact) => {
    if (artifact.kind !== "patch_plan" && artifact.kind !== "repair_patch_plan") return [];
    const parsed = parseArtifact(artifact, RepositoryPatchPlanSchema, input.artifact_index_path);
    return parsed ? [patchPlanSummary(parsed, artifact.artifact_id, artifact.validation_status)] : [];
  });
  const patchArtifacts = input.artifacts.flatMap((artifact) => {
    if (artifact.kind !== "patch_artifact" && artifact.kind !== "final_patch_artifact") return [];
    const parsed = parseArtifact(artifact, RepositoryPatchArtifactSchema, input.artifact_index_path);
    return parsed ? [patchArtifactSummary(parsed)] : [];
  });
  const verificationReports = input.artifacts.flatMap((artifact) => {
    if (artifact.kind !== "verification_report") return [];
    const parsed = parseArtifact(artifact, RepositoryVerificationReportSchema, input.artifact_index_path);
    return parsed ? [verificationSummary(parsed)] : [];
  });
  const repairAttempts = input.artifacts.flatMap((artifact) => {
    if (artifact.kind !== "repair_decision" && artifact.kind !== "repair_patch_plan") return [];
    const parsed = parseArtifact(artifact, RepairAttemptSchema, input.artifact_index_path);
    return parsed ? [{ ...repairSummary(parsed), artifact_id: artifact.artifact_id }] : [];
  });
  const reviewArtifact = [...input.artifacts].reverse().find((artifact) => artifact.kind === "review_report");
  const review = reviewArtifact ? parseArtifact(reviewArtifact, RepositoryReviewReportSchema, input.artifact_index_path) : undefined;
  const latestPatch = [...patchArtifacts].reverse().find((artifact) => artifact.apply_status === "applied") ?? patchArtifacts.at(-1);
  const finalPatchArtifact = input.artifacts.find((artifact) => artifact.kind === "final_patch_artifact") ?? (latestPatch ? input.artifacts.find((artifact) => artifact.artifact_id === latestPatch.artifact_id) : undefined);
  const finalPatch = latestPatch && finalPatchArtifact
    ? {
      artifact_id: finalPatchArtifact.artifact_id,
      changed_files: latestPatch.changed_files,
      unified_diff: latestPatch.unified_diff,
      export_command: `open-lagrange repo patch ${input.plan_id} --output final.patch`,
      apply_command: "git apply final.patch",
    }
    : undefined;

  return {
    evidence,
    patch_plans: patchPlans,
    patch_artifacts: patchArtifacts,
    verification_reports: verificationReports,
    repair_attempts: repairAttempts,
    ...(review ? { review_report: reviewSummary(review) } : {}),
    ...(finalPatch ? { final_patch: finalPatch } : {}),
  };
}

function evidenceSummary(bundle: EvidenceBundle): EvidenceBundleSummary {
  return {
    evidence_bundle_id: bundle.evidence_bundle_id,
    artifact_id: bundle.artifact_id,
    files: bundle.files.map((file) => ({
      path: file.path,
      reason: file.reason,
      ...(file.line_start ? { line_start: file.line_start } : {}),
      ...(file.line_end ? { line_end: file.line_end } : {}),
      artifact_ref: bundle.artifact_id,
    })),
    findings: bundle.findings.map((finding) => finding.summary),
    notes: bundle.notes,
    created_at: bundle.created_at,
  };
}

function patchPlanSummary(plan: RepositoryPatchPlan, artifactId: string, validationStatus: string | undefined): PatchPlanSummary {
  return {
    patch_plan_id: plan.patch_plan_id,
    artifact_id: artifactId,
    summary: plan.summary,
    operations: plan.operations.map((operation) => ({
      operation_id: operation.operation_id,
      kind: operation.kind,
      relative_path: operation.relative_path,
      rationale: operation.rationale,
    })),
    expected_changed_files: plan.expected_changed_files,
    evidence_refs: plan.evidence_refs,
    risk_level: plan.risk_level,
    approval_required: plan.approval_required,
    ...(validationStatus ? { validation_status: validationStatus } : {}),
  };
}

function patchArtifactSummary(patch: RepositoryPatchArtifact): PatchArtifactSummary {
  return {
    patch_artifact_id: patch.patch_artifact_id,
    artifact_id: patch.artifact_id,
    changed_files: patch.changed_files,
    unified_diff: patch.unified_diff,
    apply_status: patch.apply_status,
    error_count: patch.errors.length,
    created_at: patch.created_at,
  };
}

function verificationSummary(report: RepositoryVerificationReport): VerificationReportSummary {
  return {
    verification_report_id: report.verification_report_id,
    artifact_id: report.artifact_id,
    passed: report.passed,
    command_results: report.command_results.map((result) => ({
      command_id: result.command_id,
      exit_code: result.exit_code,
      status: result.status,
      stdout_preview: result.stdout_preview,
      stderr_preview: result.stderr_preview,
      duration_ms: result.duration_ms,
      ...(result.raw_artifact_id ? { raw_artifact_id: result.raw_artifact_id } : {}),
    })),
    failures: report.failures,
    created_at: report.created_at,
  };
}

function repairSummary(attempt: RepairAttempt): RepairAttemptSummary {
  return {
    repair_attempt_id: attempt.repair_attempt_id,
    attempt: attempt.attempt,
    failure_summary: attempt.failure_summary,
    status: attempt.status,
    decision: attempt.decision.decision,
    decision_reason: attempt.decision.reason,
    created_at: attempt.created_at,
  };
}

function reviewSummary(report: RepositoryReviewReport): ReviewReportSummary {
  return {
    review_report_id: report.review_report_id,
    artifact_id: report.artifact_id,
    status: report.status,
    title: report.title,
    summary: report.summary,
    changed_files: report.changed_files,
    verification_summary: report.verification_summary,
    risk_notes: report.risk_notes,
    followups: report.followups,
    ...(report.final_patch_artifact_id ? { final_patch_artifact_id: report.final_patch_artifact_id } : {}),
  };
}

function parseArtifact<T>(artifact: ArtifactSummary, schema: { readonly safeParse: (value: unknown) => { readonly success: true; readonly data: T } | { readonly success: false } }, indexPath: string | undefined): T | undefined {
  const shown = showArtifact(artifact.artifact_id, indexPath);
  const parsed = schema.safeParse(shown?.content);
  return parsed.success ? parsed.data : undefined;
}
