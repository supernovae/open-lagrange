import { z } from "zod";

export const VerificationFailure = z.object({
  command_id: z.string().min(1),
  summary: z.string().min(1),
  stderr_preview: z.string(),
}).strict();

export const VerificationCommandResult = z.object({
  command_id: z.string().min(1),
  exit_code: z.number().int().nullable(),
  status: z.enum(["passed", "failed", "timeout", "skipped"]),
  stdout_preview: z.string(),
  stderr_preview: z.string(),
  duration_ms: z.number().int().min(0),
  truncated: z.boolean(),
  raw_artifact_id: z.string().min(1).optional(),
}).strict();

export const RepositoryVerificationReport = z.object({
  verification_report_id: z.string().min(1),
  plan_id: z.string().min(1),
  node_id: z.string().min(1),
  command_results: z.array(VerificationCommandResult),
  passed: z.boolean(),
  failures: z.array(VerificationFailure),
  artifact_id: z.string().min(1),
  created_at: z.string().datetime(),
}).strict();

export type VerificationFailure = z.infer<typeof VerificationFailure>;
export type VerificationCommandResult = z.infer<typeof VerificationCommandResult>;
export type RepositoryVerificationReport = z.infer<typeof RepositoryVerificationReport>;
