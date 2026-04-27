import type { Logger, PackExecutionContext } from "./types.js";

const logger: Logger = {
  debug() {},
  info() {},
  warn() {},
  error() {},
};

export function createTestPackContext(overrides: Partial<PackExecutionContext> = {}): PackExecutionContext {
  return {
    delegation_context: {},
    capability_snapshot_id: "caps_test",
    project_id: "project-test",
    workspace_id: "workspace-test",
    task_run_id: "task-run-test",
    trace_id: "trace-test",
    idempotency_key: "idem-test",
    policy_decision: { outcome: "allow" },
    execution_bounds: {},
    logger,
    async recordObservation() {},
    async recordArtifact() {},
    async recordStatus() {},
    timeout_ms: 30_000,
    runtime_config: {},
    ...overrides,
  };
}
