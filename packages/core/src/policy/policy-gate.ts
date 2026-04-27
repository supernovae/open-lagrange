import type { CapabilityDescriptor, RiskLevel } from "../schemas/capabilities.js";
import type { DelegationContext } from "../schemas/delegation.js";
import type { ExecutionIntent } from "../schemas/open-cot.js";
import type { ExecutionBounds, ScopedTask } from "../schemas/reconciliation.js";

export type PolicyGateResult =
  | { readonly outcome: "allow"; readonly reason: string }
  | { readonly outcome: "deny"; readonly reason: string }
  | { readonly outcome: "requires_approval"; readonly reason: string }
  | { readonly outcome: "yield"; readonly reason: string };

export interface PolicyGateInput {
  readonly delegation_context: DelegationContext;
  readonly scoped_task: ScopedTask;
  readonly capability: CapabilityDescriptor;
  readonly intent: ExecutionIntent;
  readonly bounds: ExecutionBounds;
  readonly endpoint_attempts_used: number;
  readonly now: string;
}

const RISK_ORDER: Record<RiskLevel, number> = {
  read: 0,
  write: 1,
  external_side_effect: 2,
  destructive: 3,
};

export function evaluatePolicy(input: PolicyGateInput): PolicyGateResult {
  if (input.endpoint_attempts_used >= input.bounds.max_total_endpoint_attempts) {
    return { outcome: "yield", reason: "Endpoint execution budget reached" };
  }

  if (Date.parse(input.delegation_context.expires_at) <= Date.parse(input.now)) {
    return { outcome: "deny", reason: "Delegation context expired" };
  }

  const capabilityKey = `${input.capability.endpoint_id}.${input.capability.capability_name}`;
  const allowed =
    input.delegation_context.allowed_capabilities.includes(input.capability.capability_name) ||
    input.delegation_context.allowed_capabilities.includes(capabilityKey) ||
    input.scoped_task.allowed_capabilities.includes(input.capability.capability_name) ||
    input.scoped_task.allowed_capabilities.includes(capabilityKey);
  if (!allowed) {
    return { outcome: "deny", reason: "Capability is outside delegated allowance" };
  }

  const denied = input.scoped_task.allowed_scopes.some((scope) =>
    input.delegation_context.denied_scopes.includes(scope),
  );
  if (denied) return { outcome: "deny", reason: "Task scope intersects denied scope" };

  if (!input.intent.idempotency_key.trim()) {
    return { outcome: "deny", reason: "Missing idempotency key" };
  }

  if (
    RISK_ORDER[input.intent.risk_level] > RISK_ORDER[input.delegation_context.max_risk_level] ||
    RISK_ORDER[input.intent.risk_level] > RISK_ORDER[input.scoped_task.max_risk_level]
  ) {
    return { outcome: "deny", reason: "Intent risk exceeds delegated risk" };
  }

  if (
    input.capability.requires_approval ||
    input.intent.requires_approval ||
    input.delegation_context.approval_required_for.includes(input.intent.risk_level) ||
    RISK_ORDER[input.intent.risk_level] > RISK_ORDER[input.bounds.max_risk_without_approval]
  ) {
    return { outcome: "requires_approval", reason: "Intent requires approval" };
  }

  return { outcome: "allow", reason: "Policy gate allowed execution" };
}
