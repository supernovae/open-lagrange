import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import { buildPackExecutionContext } from "../src/capability-registry/context.js";
import { createCapabilitySnapshotForTask, executeCapabilityThroughRegistry, packRegistry } from "../src/capability-registry/registry.js";
import { loadRepositoryWorkspace } from "../src/repository/workspace.js";

describe("core capability registry", () => {
  it("exposes repository capabilities through the registry", () => {
    const snapshot = createCapabilitySnapshotForTask({
      allowed_scopes: ["repository:read", "repository:write"],
      denied_scopes: [],
      allowed_capabilities: ["repo.read_file", "repo.apply_patch"],
      max_risk_level: "write",
      trust_levels: ["trusted_core"],
      now: "2026-04-27T16:00:00.000Z",
    });
    expect(snapshot.capabilities.map((capability) => capability.capability_name)).toContain("repo.read_file");
    expect(snapshot.capabilities.map((capability) => capability.capability_name)).toContain("repo.apply_patch");
  });

  it("executes repository capabilities through the registry", async () => {
    const workspace = loadRepositoryWorkspace({ repo_root: process.cwd(), trace_id: "trace-test", dry_run: true });
    const context = buildPackExecutionContext({
      delegation_context: delegationContext(),
      capability_snapshot_id: "caps-test",
      project_id: "project-test",
      workspace_id: workspace.workspace_id,
      task_run_id: "task-run-test",
      trace_id: "trace-test",
      idempotency_key: "read-readme",
      policy_decision: { outcome: "allow" },
      execution_bounds: {},
      timeout_ms: 30_000,
      runtime_config: { workspace },
    });
    const result = await executeCapabilityThroughRegistry({
      endpoint_id: "open-lagrange.repository",
      capability_name: "repo.read_file",
      arguments: { relative_path: "README.md" },
      context,
    });
    expect(result.status).toBe("success");
    expect(result.output).toMatchObject({ relative_path: "README.md" });
  });

  it("keeps repository workflow execution behind registry APIs", async () => {
    const registryCapabilities = packRegistry.listCapabilities({ allowed_capabilities: ["repo.get_diff"], max_risk_level: "read" });
    expect(registryCapabilities[0]?.pack_id).toBe("open-lagrange.repository");
    const workflow = await readFile("packages/core/src/workflows/repository-task-reconciler.ts", "utf8");
    expect(workflow).not.toContain("capability-packs/repository/executor");
    expect(workflow).not.toContain("listRepositoryFiles");
  });
});

function delegationContext() {
  return {
    principal_id: "human-local",
    principal_type: "human",
    delegate_id: "open-lagrange-test",
    delegate_type: "reconciler",
    project_id: "project-test",
    workspace_id: "workspace-local",
    allowed_scopes: ["repository:read", "repository:write"],
    denied_scopes: [],
    allowed_capabilities: ["repo.read_file", "repo.apply_patch"],
    max_risk_level: "write",
    approval_required_for: ["write"],
    expires_at: "2026-04-27T17:00:00.000Z",
    trace_id: "trace-test",
    parent_run_id: "project-run-test",
    task_run_id: "task-run-test",
  };
}
