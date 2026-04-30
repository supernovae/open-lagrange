import { z } from "zod";

export const ApprovePayload = z.object({
  approved_by: z.string().min(1).max(128),
  reason: z.string().min(1).max(2_000),
  approval_token: z.string().min(1).max(256),
}).strict();

export const RejectPayload = z.object({
  rejected_by: z.string().min(1).max(128),
  reason: z.string().min(1).max(2_000),
  approval_token: z.string().min(1).max(256),
}).strict();
