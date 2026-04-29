import type { PrimitiveContext } from "./context.js";

export type PolicyDecision = "allow" | "deny" | "requires_approval";

export interface PolicyDecisionReport {
  readonly decision: PolicyDecision;
  readonly capability_ref: string;
  readonly pack_id: string;
  readonly risk_level: string;
  readonly side_effect_kind: string;
  readonly delegation_context_summary: string;
  readonly matched_rules: readonly string[];
  readonly missing_scopes: readonly string[];
  readonly required_approvals: readonly string[];
  readonly reason: string;
  readonly created_at: string;
}

export interface NetworkPolicyInput {
  readonly url: string;
  readonly method: string;
  readonly host: string;
  readonly allowed_hosts?: readonly string[];
  readonly denied_hosts?: readonly string[];
  readonly is_private_host?: boolean;
}

export interface SideEffectPolicyInput {
  readonly risk_level: string;
  readonly side_effect_kind: string;
  readonly requires_approval?: boolean;
  readonly required_scopes?: readonly string[];
}

function baseReport(context: PrimitiveContext, input: {
  readonly decision: PolicyDecision;
  readonly risk_level: string;
  readonly side_effect_kind: string;
  readonly matched_rules?: readonly string[];
  readonly missing_scopes?: readonly string[];
  readonly required_approvals?: readonly string[];
  readonly reason: string;
}): PolicyDecisionReport {
  return {
    decision: input.decision,
    capability_ref: `${context.pack_id}.${context.capability_id}`,
    pack_id: context.pack_id,
    risk_level: input.risk_level,
    side_effect_kind: input.side_effect_kind,
    delegation_context_summary: typeof context.delegation_context === "string" ? context.delegation_context : "structured delegation context",
    matched_rules: input.matched_rules ?? [],
    missing_scopes: input.missing_scopes ?? [],
    required_approvals: input.required_approvals ?? [],
    reason: input.reason,
    created_at: new Date().toISOString(),
  };
}

export function evaluateNetwork(context: PrimitiveContext, input: NetworkPolicyInput): PolicyDecisionReport {
  const allowedHosts = input.allowed_hosts ?? context.policy_context.allowed_hosts ?? [];
  const deniedHosts = input.denied_hosts ?? context.policy_context.denied_hosts ?? [];
  if (deniedHosts.includes(input.host)) {
    return baseReport(context, {
      decision: "deny",
      risk_level: "read",
      side_effect_kind: "network_read",
      matched_rules: ["network.denied_hosts"],
      reason: `Host ${input.host} is denied.`,
    });
  }
  if (allowedHosts.length > 0 && !allowedHosts.includes(input.host)) {
    return baseReport(context, {
      decision: "deny",
      risk_level: "read",
      side_effect_kind: "network_read",
      matched_rules: ["network.allowed_hosts"],
      reason: `Host ${input.host} is not declared in allowed hosts.`,
    });
  }
  if (input.is_private_host === true && context.policy_context.allow_private_network !== true && !context.limits.allow_private_network) {
    return baseReport(context, {
      decision: "deny",
      risk_level: "read",
      side_effect_kind: "network_read",
      matched_rules: ["network.block_private_hosts"],
      reason: `Host ${input.host} is local or private.`,
    });
  }
  return baseReport(context, {
    decision: "allow",
    risk_level: "read",
    side_effect_kind: input.method === "GET" ? "network_read" : "network_write",
    matched_rules: ["network.protocol", "network.host"],
    reason: `Network request to ${input.host} is allowed.`,
  });
}

export function evaluateSideEffect(context: PrimitiveContext, input: SideEffectPolicyInput): PolicyDecisionReport {
  const granted = new Set(context.policy_context.granted_scopes ?? []);
  const missingScopes = (input.required_scopes ?? []).filter((scope) => !granted.has(scope));
  if (missingScopes.length > 0) {
    return baseReport(context, {
      decision: "deny",
      risk_level: input.risk_level,
      side_effect_kind: input.side_effect_kind,
      missing_scopes: missingScopes,
      matched_rules: ["scopes.required"],
      reason: "Required scopes are missing.",
    });
  }
  if (input.requires_approval === true || input.risk_level !== "read" || input.side_effect_kind !== "none") {
    return baseReport(context, {
      decision: "requires_approval",
      risk_level: input.risk_level,
      side_effect_kind: input.side_effect_kind,
      required_approvals: [`${context.pack_id}.${context.capability_id}`],
      matched_rules: ["approval.side_effect"],
      reason: "Capability side effects require approval.",
    });
  }
  return baseReport(context, {
    decision: "allow",
    risk_level: input.risk_level,
    side_effect_kind: input.side_effect_kind,
    matched_rules: ["risk.read_only"],
    reason: "Read-only capability is allowed.",
  });
}

export function evaluateCapability(context: PrimitiveContext, input: SideEffectPolicyInput): PolicyDecisionReport {
  return evaluateSideEffect(context, input);
}

export const policy = {
  evaluateNetwork,
  evaluateSideEffect,
  evaluateCapability,
};
