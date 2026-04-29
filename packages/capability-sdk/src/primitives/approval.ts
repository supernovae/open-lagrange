import type { PrimitiveContext } from "./context.js";
import { primitiveError } from "./errors.js";

export interface ApprovalRequestInput {
  readonly reason: string;
  readonly risk_level: string;
  readonly side_effect_kind: string;
  readonly capability_ref?: string;
  readonly metadata?: Record<string, unknown>;
}

export async function request(context: PrimitiveContext, input: ApprovalRequestInput): Promise<unknown> {
  const approval = {
    approval_id: `approval_${context.trace_id}_${Date.now()}`,
    capability_ref: input.capability_ref ?? `${context.pack_id}.${context.capability_id}`,
    pack_id: context.pack_id,
    capability_id: context.capability_id,
    reason: input.reason,
    risk_level: input.risk_level,
    side_effect_kind: input.side_effect_kind,
    metadata: context.redactor.redactObject(input.metadata ?? {}),
    created_at: new Date().toISOString(),
  };
  if (!context.approval_store) {
    await context.artifact_store.write({ kind: "approval_request", ...approval });
    return { status: "requires_approval", request: approval };
  }
  return context.approval_store.requestApproval(approval);
}

export async function requireForRisk(context: PrimitiveContext, input: ApprovalRequestInput): Promise<unknown | undefined> {
  if (input.risk_level === "read" && input.side_effect_kind === "none") return undefined;
  if (!input.reason) throw primitiveError("Approval reason is required.", "PRIMITIVE_INVALID_INPUT");
  return request(context, input);
}

export const approval = {
  request,
  requireForRisk,
};
