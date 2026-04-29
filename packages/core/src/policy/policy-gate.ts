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

export interface PolicyDecisionReport {
  readonly decision: PolicyGateResult["outcome"];
  readonly capability_ref: string;
  readonly pack_id: string;
  readonly risk_level: RiskLevel;
  readonly side_effect_kind: string;
  readonly delegation_context_summary: {
    readonly principal_id: string;
    readonly delegate_id: string;
    readonly max_risk_level: RiskLevel;
    readonly allowed_capability_count: number;
    readonly denied_scope_count: number;
  };
  readonly matched_rules: readonly string[];
  readonly missing_scopes: readonly string[];
  readonly required_approvals: readonly string[];
  readonly reason: string;
  readonly created_at: string;
}

const RISK_ORDER: Record<RiskLevel, number> = {
  read: 0,
  write: 1,
  external_side_effect: 2,
  destructive: 3,
};

export function evaluatePolicy(input: PolicyGateInput): PolicyGateResult {
  return evaluatePolicyWithReport(input).result;
}

export function evaluatePolicyWithReport(input: PolicyGateInput): { readonly result: PolicyGateResult; readonly report: PolicyDecisionReport } {
  const matchedRules: string[] = [];
  const missingScopes: string[] = [];
  const requiredApprovals: string[] = [];
  const capabilityRef = `${input.capability.endpoint_id}.${input.capability.capability_name}`;
  const sideEffectKind = (input.capability as { readonly side_effect_kind?: unknown }).side_effect_kind;
  const finish = (result: PolicyGateResult) => ({
    result,
    report: {
      decision: result.outcome,
      capability_ref: capabilityRef,
      pack_id: input.capability.endpoint_id,
      risk_level: input.intent.risk_level,
      side_effect_kind: typeof sideEffectKind === "string" ? sideEffectKind : "unknown",
      delegation_context_summary: {
        principal_id: input.delegation_context.principal_id,
        delegate_id: input.delegation_context.delegate_id,
        max_risk_level: input.delegation_context.max_risk_level,
        allowed_capability_count: input.delegation_context.allowed_capabilities.length,
        denied_scope_count: input.delegation_context.denied_scopes.length,
      },
      matched_rules: matchedRules,
      missing_scopes: missingScopes,
      required_approvals: requiredApprovals,
      reason: result.reason,
      created_at: input.now,
    },
  });

  if (input.endpoint_attempts_used >= input.bounds.max_total_endpoint_attempts) {
    return finish({ outcome: "yield", reason: "Endpoint execution budget reached" });
  }
  matchedRules.push("endpoint_budget_available");

  if (Date.parse(input.delegation_context.expires_at) <= Date.parse(input.now)) {
    return finish({ outcome: "deny", reason: "Delegation context expired" });
  }
  matchedRules.push("delegation_context_active");

  const allowed =
    input.delegation_context.allowed_capabilities.includes(input.capability.capability_name) ||
    input.delegation_context.allowed_capabilities.includes(capabilityRef) ||
    input.scoped_task.allowed_capabilities.includes(input.capability.capability_name) ||
    input.scoped_task.allowed_capabilities.includes(capabilityRef);
  if (!allowed) {
    return finish({ outcome: "deny", reason: "Capability is outside delegated allowance" });
  }
  matchedRules.push("capability_allowed");

  const denied = input.scoped_task.allowed_scopes.some((scope) =>
    input.delegation_context.denied_scopes.includes(scope),
  );
  if (denied) {
    missingScopes.push(...input.scoped_task.allowed_scopes.filter((scope) => input.delegation_context.denied_scopes.includes(scope)));
    return finish({ outcome: "deny", reason: "Task scope intersects denied scope" });
  }
  matchedRules.push("scopes_not_denied");

  if (!input.intent.idempotency_key.trim()) {
    return finish({ outcome: "deny", reason: "Missing idempotency key" });
  }
  matchedRules.push("idempotency_key_present");

  if (
    RISK_ORDER[input.intent.risk_level] > RISK_ORDER[input.delegation_context.max_risk_level] ||
    RISK_ORDER[input.intent.risk_level] > RISK_ORDER[input.scoped_task.max_risk_level]
  ) {
    return finish({ outcome: "deny", reason: "Intent risk exceeds delegated risk" });
  }
  matchedRules.push("risk_within_bounds");

  if (
    input.capability.requires_approval ||
    input.intent.requires_approval ||
    input.delegation_context.approval_required_for.includes(input.intent.risk_level) ||
    RISK_ORDER[input.intent.risk_level] > RISK_ORDER[input.bounds.max_risk_without_approval]
  ) {
    requiredApprovals.push(input.intent.risk_level);
    return finish({ outcome: "requires_approval", reason: "Intent requires approval" });
  }
  matchedRules.push("approval_not_required");

  return finish({ outcome: "allow", reason: "Policy gate allowed execution" });
}
