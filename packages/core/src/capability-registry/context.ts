import type { PackExecutionContext } from "@open-lagrange/capability-sdk";
import type { DelegationContext } from "../schemas/delegation.js";
import type { ExecutionBounds } from "../schemas/reconciliation.js";

export function buildPackExecutionContext(input: {
  readonly delegation_context: DelegationContext;
  readonly capability_snapshot_id: string;
  readonly project_id: string;
  readonly workspace_id: string;
  readonly task_run_id: string;
  readonly trace_id: string;
  readonly idempotency_key: string;
  readonly policy_decision: PolicyGateResult | unknown;
  readonly execution_bounds: ExecutionBounds | unknown;
  readonly timeout_ms: number;
  readonly runtime_config?: Record<string, unknown>;
}): PackExecutionContext {
  return {
    delegation_context: input.delegation_context,
    capability_snapshot_id: input.capability_snapshot_id,
    project_id: input.project_id,
    workspace_id: input.workspace_id,
    task_run_id: input.task_run_id,
    trace_id: input.trace_id,
    idempotency_key: input.idempotency_key,
    policy_decision: input.policy_decision,
    execution_bounds: input.execution_bounds,
    logger: {
      debug() {},
      info() {},
      warn() {},
      error() {},
    },
    async recordObservation() {},
    async recordArtifact() {},
    async recordStatus() {},
    timeout_ms: input.timeout_ms,
    runtime_config: input.runtime_config ?? {},
  };
}
import type { PolicyGateResult } from "../policy/policy-gate.js";
