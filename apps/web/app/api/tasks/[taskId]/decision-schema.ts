import { z } from "zod";

export const ApprovePayload = z.object({
  approved_by: z.string().min(1),
  reason: z.string().min(1),
  approval_token: z.string().min(1).optional(),
}).strict();

export const RejectPayload = z.object({
  rejected_by: z.string().min(1),
  reason: z.string().min(1),
  approval_token: z.string().min(1).optional(),
}).strict();
