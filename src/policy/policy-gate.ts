import type { CapabilityDescriptor, RiskLevel } from "../schemas/capabilities.js";
import type { ExecutionIntent } from "../schemas/open-cot.js";

export interface ExecutionBounds {
  readonly max_execution_intents: number;
  readonly max_total_execution_attempts: number;
  readonly max_risk_without_approval: RiskLevel;
  readonly token_budget_remaining?: number;
  readonly cost_budget_remaining?: number;
}

export interface PolicyGateInput {
  readonly user_prompt: string;
  readonly capability: CapabilityDescriptor;
  readonly intent: ExecutionIntent;
  readonly bounds: ExecutionBounds;
  readonly execution_attempts_used: number;
  readonly subject_ref?: string;
  readonly workspace_ref?: string;
}

export type PolicyGateResult =
  | { readonly outcome: "allow"; readonly reason: string }
  | { readonly outcome: "deny"; readonly reason: string }
  | { readonly outcome: "requires_approval"; readonly reason: string }
  | { readonly outcome: "yield"; readonly reason: string };

const RISK_ORDER: Record<RiskLevel, number> = {
  read: 0,
  write: 1,
  external_side_effect: 2,
  destructive: 3,
};

export function evaluateMockPolicy(input: PolicyGateInput): PolicyGateResult {
  if (input.execution_attempts_used >= input.bounds.max_total_execution_attempts) {
    return { outcome: "yield", reason: "Execution attempt bound reached" };
  }

  if (input.capability.requires_approval || input.intent.requires_approval) {
    return { outcome: "requires_approval", reason: "Capability requires approval" };
  }

  if (
    RISK_ORDER[input.capability.risk_level] >
    RISK_ORDER[input.bounds.max_risk_without_approval]
  ) {
    return { outcome: "requires_approval", reason: "Risk exceeds approval-free bound" };
  }

  if (!input.intent.idempotency_key.trim()) {
    return { outcome: "deny", reason: "Missing idempotency key" };
  }

  if (
    input.capability.endpoint_id === "workspace" &&
    input.capability.capability_name === "write_note" &&
    !input.user_prompt.toLowerCase().includes("write")
  ) {
    return { outcome: "deny", reason: "Prompt boundary does not include mutation" };
  }

  return { outcome: "allow", reason: "Policy gate allowed execution" };
}
