import { z } from "zod";
import { stableHash } from "../util/hash.js";

export const ScopeExpansionRequestStatus = z.enum(["pending_approval", "approved", "rejected", "expired", "applied"]);

export const ScopeExpansionRequest = z.object({
  request_id: z.string().min(1),
  plan_id: z.string().min(1),
  node_id: z.string().min(1),
  work_order_id: z.string().min(1).optional(),
  reason: z.string().min(1),
  requested_files: z.array(z.string().min(1)).optional(),
  requested_capabilities: z.array(z.string().min(1)).optional(),
  requested_verification_commands: z.array(z.string().min(1)).optional(),
  requested_risk_level: z.enum(["read", "write", "destructive", "external_side_effect"]).optional(),
  evidence_refs: z.array(z.string().min(1)),
  latest_failure_refs: z.array(z.string().min(1)).optional(),
  status: ScopeExpansionRequestStatus.optional(),
  created_at: z.string().datetime().optional(),
  decided_at: z.string().datetime().optional(),
  approval_id: z.string().min(1).optional(),
}).strict();

export const PersistedScopeExpansionRequest = ScopeExpansionRequest.extend({
  work_order_id: z.string().min(1),
  status: ScopeExpansionRequestStatus,
  created_at: z.string().datetime(),
}).strict();

export const ScopeExpansionApprovalPayload = z.object({
  request: PersistedScopeExpansionRequest,
  request_digest: z.string().regex(/^[a-f0-9]{64}$/),
  requested_files: z.array(z.string()),
  requested_capabilities: z.array(z.string()),
  requested_verification_commands: z.array(z.string()),
}).strict();

export type ScopeExpansionRequest = z.infer<typeof ScopeExpansionRequest>;
export type PersistedScopeExpansionRequest = z.infer<typeof PersistedScopeExpansionRequest>;
export type ScopeExpansionApprovalPayload = z.infer<typeof ScopeExpansionApprovalPayload>;

export function normalizeScopeExpansionRequest(input: {
  readonly request: ScopeExpansionRequest;
  readonly plan_id: string;
  readonly node_id: string;
  readonly work_order_id: string;
  readonly approval_id?: string;
  readonly status?: PersistedScopeExpansionRequest["status"];
  readonly now?: string;
}): PersistedScopeExpansionRequest {
  const now = input.now ?? new Date().toISOString();
  return PersistedScopeExpansionRequest.parse({
    ...input.request,
    plan_id: input.plan_id,
    node_id: input.node_id,
    work_order_id: input.request.work_order_id ?? input.work_order_id,
    status: input.status ?? input.request.status ?? "pending_approval",
    created_at: input.request.created_at ?? now,
    ...(input.request.decided_at ? { decided_at: input.request.decided_at } : {}),
    ...(input.approval_id ?? input.request.approval_id ? { approval_id: input.approval_id ?? input.request.approval_id } : {}),
  });
}

export function scopeExpansionRequestDigest(request: ScopeExpansionRequest | PersistedScopeExpansionRequest): string {
  const parsed = ScopeExpansionRequest.parse(request);
  return stableHash({
    request_id: parsed.request_id,
    plan_id: parsed.plan_id,
    node_id: parsed.node_id,
    work_order_id: parsed.work_order_id,
    reason: parsed.reason,
    requested_files: parsed.requested_files ?? [],
    requested_capabilities: parsed.requested_capabilities ?? [],
    requested_verification_commands: parsed.requested_verification_commands ?? [],
    requested_risk_level: parsed.requested_risk_level,
    evidence_refs: parsed.evidence_refs,
    latest_failure_refs: parsed.latest_failure_refs ?? [],
  });
}

export function markScopeExpansionRequest(
  request: PersistedScopeExpansionRequest,
  status: PersistedScopeExpansionRequest["status"],
  now = new Date().toISOString(),
): PersistedScopeExpansionRequest {
  return PersistedScopeExpansionRequest.parse({
    ...request,
    status,
    ...(status === "approved" || status === "rejected" || status === "expired" || status === "applied" ? { decided_at: request.decided_at ?? now } : {}),
  });
}
