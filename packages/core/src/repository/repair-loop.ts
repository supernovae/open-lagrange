import { z } from "zod";
import { summarizeVerificationFailure } from "./failure-summarizer.js";
import { VerificationReport, type VerificationReport as VerificationReportType } from "../schemas/repository.js";

export const RepairAttempt = z.object({
  repair_attempt_id: z.string().min(1),
  plan_id: z.string().min(1),
  node_id: z.string().min(1),
  attempt: z.number().int().min(1),
  failure_summary: z.string(),
  status: z.enum(["pending", "applied", "yielded"]),
  created_at: z.string().datetime(),
}).strict();

export type RepairAttempt = z.infer<typeof RepairAttempt>;

export function nextRepairAttempt(input: {
  readonly plan_id: string;
  readonly node_id: string;
  readonly previous_attempts: readonly RepairAttempt[];
  readonly verification_report: VerificationReportType;
  readonly max_attempts?: number;
  readonly now: string;
}): RepairAttempt {
  const attempt = input.previous_attempts.length + 1;
  const max = input.max_attempts ?? 3;
  const failure_summary = summarizeVerificationFailure(VerificationReport.parse(input.verification_report));
  return RepairAttempt.parse({
    repair_attempt_id: `repair_${input.plan_id}_${attempt}`,
    plan_id: input.plan_id,
    node_id: input.node_id,
    attempt,
    failure_summary,
    status: attempt > max || repeated(input.previous_attempts, failure_summary) ? "yielded" : "pending",
    created_at: input.now,
  });
}

function repeated(attempts: readonly RepairAttempt[], summary: string): boolean {
  return attempts.filter((attempt) => attempt.failure_summary === summary).length >= 2;
}
