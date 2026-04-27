import { describe, expect, it } from "vitest";
import { discoverMockMcpCapabilities } from "../src/mcp/mock-registry.js";
import { evaluatePolicy } from "../src/policy/policy-gate.js";
import { validateIntentForSnapshot } from "../src/reconciliation/intent-validation.js";
import type { DelegationContext } from "../src/schemas/delegation.js";
import type { ExecutionIntent } from "../src/schemas/open-cot.js";
import type { ExecutionBounds, ScopedTask } from "../src/schemas/reconciliation.js";

const now = "2026-04-27T16:00:00.000Z";

describe("reconciliation boundaries", () => {
  it("scoped discovery excludes unauthorized capabilities", () => {
    const snapshot = discoverMockMcpCapabilities({
      workspace_id: "workspace-local",
      task_scope: task({ allowed_capabilities: ["draft_readme_summary"] }),
      delegation_context: delegation({ allowed_capabilities: ["draft_readme_summary"] }),
      max_risk_level: "read",
      now,
    });

    expect(snapshot.capabilities.map((capability) => capability.capability_name)).toEqual(["draft_readme_summary"]);
  });

  it("rejects unknown capabilities and digest mismatches", () => {
    const snapshot = discoverMockMcpCapabilities({
      workspace_id: "workspace-local",
      task_scope: task({ allowed_capabilities: ["draft_readme_summary"] }),
      delegation_context: delegation({ allowed_capabilities: ["draft_readme_summary"] }),
      max_risk_level: "read",
      now,
    });
    const capability = snapshot.capabilities[0];
    if (!capability) throw new Error("missing fixture capability");
    const intent: ExecutionIntent = {
      intent_id: "intent-test",
      snapshot_id: snapshot.snapshot_id,
      endpoint_id: capability.endpoint_id,
      capability_name: "missing",
      capability_digest: capability.capability_digest,
      risk_level: capability.risk_level,
      requires_approval: capability.requires_approval,
      idempotency_key: "idem-test",
      arguments: { title: "README", source_summary: "source" },
    };

    expect(validateIntentForSnapshot({ intent, snapshot, task_id: "task-test", now })).toMatchObject({
      ok: false,
      error: { code: "UNKNOWN_CAPABILITY" },
    });

    expect(validateIntentForSnapshot({
      intent: { ...intent, capability_name: capability.capability_name, capability_digest: "0".repeat(64) },
      snapshot,
      task_id: "task-test",
      now,
    })).toMatchObject({
      ok: false,
      error: { code: "CAPABILITY_DIGEST_MISMATCH" },
    });
  });

  it("requires approval for write capabilities", () => {
    const snapshot = discoverMockMcpCapabilities({
      workspace_id: "workspace-local",
      task_scope: task({ allowed_scopes: ["project:write"], allowed_capabilities: ["write_note"], max_risk_level: "write" }),
      delegation_context: delegation({
        allowed_scopes: ["project:write"],
        allowed_capabilities: ["write_note"],
        denied_scopes: [],
        max_risk_level: "write",
        approval_required_for: ["write"],
      }),
      max_risk_level: "write",
      now,
    });
    const capability = snapshot.capabilities[0];
    if (!capability) throw new Error("missing fixture capability");

    const result = evaluatePolicy({
      delegation_context: delegation({
        allowed_scopes: ["project:write"],
        allowed_capabilities: ["write_note"],
        denied_scopes: [],
        max_risk_level: "write",
        approval_required_for: ["write"],
      }),
      scoped_task: task({ allowed_scopes: ["project:write"], allowed_capabilities: ["write_note"], max_risk_level: "write" }),
      capability,
      intent: {
        intent_id: "intent-write",
        snapshot_id: snapshot.snapshot_id,
        endpoint_id: capability.endpoint_id,
        capability_name: capability.capability_name,
        capability_digest: capability.capability_digest,
        risk_level: capability.risk_level,
        requires_approval: capability.requires_approval,
        idempotency_key: "idem-write",
        arguments: { path: "notes/summary.md", content: "summary" },
      },
      bounds: bounds({ max_risk_without_approval: "read" }),
      endpoint_attempts_used: 0,
      now,
    });

    expect(result.outcome).toBe("requires_approval");
  });

  it("denies destructive intent outside delegated risk", () => {
    const destructiveCapability = {
      endpoint_id: "mock.workspace",
      capability_name: "remove_workspace",
      description: "Remove a workspace",
      input_schema: { type: "object" },
      risk_level: "destructive" as const,
      requires_approval: true,
      capability_digest: "a".repeat(64),
    };
    const result = evaluatePolicy({
      delegation_context: delegation({ allowed_capabilities: ["remove_workspace"] }),
      scoped_task: task({ allowed_capabilities: ["remove_workspace"] }),
      capability: destructiveCapability,
      intent: {
        intent_id: "intent-destructive",
        snapshot_id: "snapshot-test",
        endpoint_id: destructiveCapability.endpoint_id,
        capability_name: destructiveCapability.capability_name,
        capability_digest: destructiveCapability.capability_digest,
        risk_level: destructiveCapability.risk_level,
        requires_approval: destructiveCapability.requires_approval,
        idempotency_key: "idem-destructive",
        arguments: {},
      },
      bounds: bounds(),
      endpoint_attempts_used: 0,
      now,
    });

    expect(result.outcome).toBe("deny");
  });
});

function delegation(patch: Partial<DelegationContext> = {}): DelegationContext {
  return {
    principal_id: "human-local",
    principal_type: "human",
    delegate_id: "open-lagrange-test",
    delegate_type: "reconciler",
    project_id: "project-test",
    workspace_id: "workspace-local",
    allowed_scopes: ["project:read", "project:summarize"],
    denied_scopes: ["project:write"],
    allowed_capabilities: ["draft_readme_summary", "read_file"],
    max_risk_level: "read",
    approval_required_for: ["write", "destructive", "external_side_effect"],
    expires_at: "2026-04-27T17:00:00.000Z",
    trace_id: "trace-test",
    parent_run_id: "project-run-test",
    ...patch,
  };
}

function task(patch: Partial<ScopedTask> = {}): ScopedTask {
  return {
    task_id: "task-test",
    title: "Create README summary",
    objective: "Create a short README summary for this repository.",
    allowed_scopes: ["project:read", "project:summarize"],
    allowed_capabilities: ["draft_readme_summary", "read_file"],
    max_risk_level: "read",
    ...patch,
  };
}

function bounds(patch: Partial<ExecutionBounds> = {}): ExecutionBounds {
  return {
    max_tasks_per_project: 3,
    max_execution_intents_per_task: 2,
    max_total_endpoint_attempts: 2,
    max_critic_passes: 1,
    max_risk_without_approval: "read",
    ...patch,
  };
}
