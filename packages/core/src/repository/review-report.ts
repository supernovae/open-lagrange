import { z } from "zod";
import { ReviewReport } from "../schemas/repository.js";

export const RepositoryReviewReport = ReviewReport.extend({
  review_report_id: z.string().min(1),
  plan_id: z.string().min(1),
  patch_artifact_id: z.string().min(1),
  verification_report_id: z.string().min(1),
  changed_files: z.array(z.string()),
  created_at: z.string().datetime(),
}).strict();

export type RepositoryReviewReport = z.infer<typeof RepositoryReviewReport>;
