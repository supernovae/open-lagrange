import { z } from "zod";
import { RiskLevel } from "./capabilities.js";

export const PrincipalType = z.enum(["human", "service", "runtime"]);
export const DelegateType = z.enum(["reconciler", "service", "runtime"]);

export const DelegationContext = z.object({
  principal_id: z.string().min(1),
  principal_type: PrincipalType,
  delegate_id: z.string().min(1),
  delegate_type: DelegateType,
  project_id: z.string().min(1),
  workspace_id: z.string().min(1),
  allowed_scopes: z.array(z.string()),
  denied_scopes: z.array(z.string()),
  allowed_capabilities: z.array(z.string()),
  max_risk_level: RiskLevel,
  approval_required_for: z.array(RiskLevel),
  expires_at: z.string().datetime(),
  trace_id: z.string().min(1),
  parent_run_id: z.string().min(1),
  task_run_id: z.string().min(1).optional(),
}).strict();

export type PrincipalType = z.infer<typeof PrincipalType>;
export type DelegateType = z.infer<typeof DelegateType>;
export type DelegationContext = z.infer<typeof DelegationContext>;
