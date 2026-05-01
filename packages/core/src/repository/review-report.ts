import { z } from "zod";

export const RepositoryReviewReport = z.object({
  review_report_id: z.string().min(1),
  plan_id: z.string().min(1),
  status: z.enum(["ready", "completed_with_warnings", "failed", "yielded"]),
  title: z.string().min(1),
  summary: z.string().min(1),
  changed_files: z.array(z.string()),
  verification_summary: z.string(),
  risk_notes: z.array(z.string()),
  followups: z.array(z.string()),
  final_patch_artifact_id: z.string().min(1).optional(),
  artifact_id: z.string().min(1),
  created_at: z.string().datetime(),
}).strict();

export type RepositoryReviewReport = z.infer<typeof RepositoryReviewReport>;
