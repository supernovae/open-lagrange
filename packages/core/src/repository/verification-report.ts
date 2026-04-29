import { z } from "zod";
import { VerificationReport } from "../schemas/repository.js";

export const RepositoryVerificationReport = VerificationReport.extend({
  verification_report_id: z.string().min(1),
  plan_id: z.string().min(1),
  node_id: z.string().min(1),
  patch_artifact_id: z.string().min(1).optional(),
  created_at: z.string().datetime(),
}).strict();

export type RepositoryVerificationReport = z.infer<typeof RepositoryVerificationReport>;
