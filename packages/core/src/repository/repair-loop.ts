import { z } from "zod";
import { summarizeVerificationFailure } from "./failure-summarizer.js";
import { RepositoryVerificationReport, type RepositoryVerificationReport as RepositoryVerificationReportType } from "./verification-report.js";

export const RepairDecision = z.object({
  decision: z.enum(["repair_within_plan", "revise_plan_required", "requires_approval", "yield"]),
  reason: z.string().min(1),
  repair_work_order_id: z.string().min(1).optional(),
  proposed_plan_update: z.unknown().optional(),
}).strict();

export const RepairAttempt = z.object({
  repair_attempt_id: z.string().min(1),
  plan_id: z.string().min(1),
  node_id: z.string().min(1),
  attempt: z.number().int().min(1),
  failure_summary: z.string(),
  status: z.enum(["pending", "applied", "yielded"]),
  decision: RepairDecision,
  created_at: z.string().datetime(),
}).strict();

export type RepairDecision = z.infer<typeof RepairDecision>;
export type RepairAttempt = z.infer<typeof RepairAttempt>;

export function nextRepairAttempt(input: {
  readonly plan_id: string;
  readonly node_id: string;
  readonly previous_attempts: readonly RepairAttempt[];
  readonly verification_report: RepositoryVerificationReportType | { readonly passed: boolean; readonly summary: string; readonly results?: readonly unknown[] };
  readonly max_attempts?: number;
  readonly now: string;
}): RepairAttempt {
  const attempt = input.previous_attempts.length + 1;
  const max = input.max_attempts ?? 3;
  const report = normalizeReport(input.verification_report, input.plan_id, input.node_id, input.now);
  const failure_summary = summarizeVerificationFailure(report);
  const shouldYield = attempt > max || repeated(input.previous_attempts, failure_summary);
  const decision = shouldYield
    ? RepairDecision.parse({ decision: "yield", reason: "Repair attempt limit or repeated failure reached." })
    : RepairDecision.parse({ decision: "repair_within_plan", reason: "Verification failure can be repaired within current plan.", repair_work_order_id: `repair_work_order_${input.plan_id}_${attempt}` });
  return RepairAttempt.parse({
    repair_attempt_id: `repair_${input.plan_id}_${attempt}`,
    plan_id: input.plan_id,
    node_id: input.node_id,
    attempt,
    failure_summary,
    status: shouldYield ? "yielded" : "pending",
    decision,
    created_at: input.now,
  });
}

function repeated(attempts: readonly RepairAttempt[], summary: string): boolean {
  return attempts.filter((attempt) => attempt.failure_summary === summary).length >= 2;
}

function normalizeReport(report: RepositoryVerificationReportType | { readonly passed: boolean; readonly summary: string; readonly results?: readonly unknown[] }, planId: string, nodeId: string, now: string): RepositoryVerificationReportType {
  const parsed = RepositoryVerificationReport.safeParse(report);
  if (parsed.success) return parsed.data;
  const legacy = report as { readonly passed: boolean; readonly summary: string; readonly results?: readonly unknown[] };
  const legacyResults = Array.isArray(legacy.results) ? legacy.results : [];
  return RepositoryVerificationReport.parse({
    verification_report_id: `verification_${planId}_${nodeId}`,
    plan_id: planId,
    node_id: nodeId,
    command_results: legacyResults.map((item, index) => {
      const value = item && typeof item === "object" ? item as Record<string, unknown> : {};
      const exitCode = typeof value.exit_code === "number" ? value.exit_code : 1;
      return {
        command_id: typeof value.command_id === "string" ? value.command_id : `command_${index + 1}`,
        exit_code: exitCode,
        status: exitCode === 0 ? "passed" : "failed",
        stdout_preview: typeof value.stdout_preview === "string" ? value.stdout_preview : "",
        stderr_preview: typeof value.stderr_preview === "string" ? value.stderr_preview : legacy.summary,
        duration_ms: typeof value.duration_ms === "number" ? value.duration_ms : 0,
        truncated: Boolean(value.truncated),
      };
    }),
    passed: legacy.passed,
    failures: legacy.passed ? [] : [{ command_id: "verification", summary: legacy.summary, stderr_preview: legacy.summary }],
    artifact_id: `verification_${planId}_${nodeId}`,
    created_at: now,
  });
}
