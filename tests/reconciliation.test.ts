import { describe, expect, it } from "vitest";
import { deterministicCognitiveStep } from "../src/activities/cognition.js";
import { discoverMockMcpEndpoints } from "../src/mcp/mock-registry.js";
import type { CognitiveArtifact } from "../src/schemas/open-cot.js";
import { runReconciliation } from "../src/workflows/reconciler.js";

describe("reconciliation", () => {
  it("completes a read-only execution intent", async () => {
    const snapshot = await discoverMockMcpEndpoints();
    const artifact = deterministicCognitiveStep({
      user_prompt: "search the project docs",
      capability_snapshot: snapshot,
    });

    const result = await runReconciliation(
      { user_prompt: "search the project docs" },
      snapshot,
      artifact,
    );

    expect(result.status).toBe("completed");
    expect(result.executed_intents).toHaveLength(1);
    expect(result.errors).toHaveLength(0);
  });

  it("fails on snapshot mismatch", async () => {
    const snapshot = await discoverMockMcpEndpoints();
    const artifact = deterministicCognitiveStep({
      user_prompt: "search the project docs",
      capability_snapshot: snapshot,
    });

    const result = await runReconciliation(
      { user_prompt: "search the project docs" },
      { ...snapshot, snapshot_id: "caps_other" },
      artifact,
    );

    expect(result.status).toBe("failed");
    expect(result.errors[0]?.code).toBe("SNAPSHOT_MISMATCH");
  });

  it("records unknown MCP server", async () => {
    const snapshot = await discoverMockMcpEndpoints();
    const artifact = withFirstIntent(
      deterministicCognitiveStep({ user_prompt: "search", capability_snapshot: snapshot }),
      { endpoint_id: "missing" },
    );

    const result = await runReconciliation({ user_prompt: "search" }, snapshot, artifact);

    expect(result.status).toBe("failed");
    expect(result.errors[0]?.code).toBe("UNKNOWN_ENDPOINT");
  });

  it("records unknown capability", async () => {
    const snapshot = await discoverMockMcpEndpoints();
    const artifact = withFirstIntent(
      deterministicCognitiveStep({ user_prompt: "search", capability_snapshot: snapshot }),
      { capability_name: "missing" },
    );

    const result = await runReconciliation({ user_prompt: "search" }, snapshot, artifact);

    expect(result.status).toBe("failed");
    expect(result.errors[0]?.code).toBe("UNKNOWN_CAPABILITY");
  });

  it("records capability digest mismatch", async () => {
    const snapshot = await discoverMockMcpEndpoints();
    const artifact = withFirstIntent(
      deterministicCognitiveStep({ user_prompt: "search", capability_snapshot: snapshot }),
      { capability_digest: "0".repeat(64) },
    );

    const result = await runReconciliation({ user_prompt: "search" }, snapshot, artifact);

    expect(result.status).toBe("failed");
    expect(result.errors[0]?.code).toBe("CAPABILITY_DIGEST_MISMATCH");
  });

  it("records argument schema failure", async () => {
    const snapshot = await discoverMockMcpEndpoints();
    const artifact = withFirstIntent(
      deterministicCognitiveStep({ user_prompt: "search", capability_snapshot: snapshot }),
      { arguments: {} },
    );

    const result = await runReconciliation({ user_prompt: "search" }, snapshot, artifact);

    expect(result.status).toBe("failed");
    expect(result.errors[0]?.code).toBe("SCHEMA_VALIDATION_FAILED");
  });

  it("returns approval requirement for write risk", async () => {
    const snapshot = await discoverMockMcpEndpoints();
    const artifact = deterministicCognitiveStep({
      user_prompt: "write a note",
      capability_snapshot: snapshot,
    });

    const result = await runReconciliation({ user_prompt: "write a note" }, snapshot, artifact);

    expect(result.status).toBe("requires_approval");
    expect(result.errors[0]?.code).toBe("APPROVAL_REQUIRED");
  });

  it("records exceeded execution bound", async () => {
    const snapshot = await discoverMockMcpEndpoints();
    const artifact = deterministicCognitiveStep({
      user_prompt: "search",
      capability_snapshot: snapshot,
    });

    const result = await runReconciliation(
      {
        user_prompt: "search",
        bounds: { max_execution_intents: 0 },
      },
      snapshot,
      artifact,
    );

    expect(result.status).toBe("failed");
    expect(result.errors[0]?.code).toBe("BUDGET_EXCEEDED");
  });

  it("records precondition failure", async () => {
    const snapshot = await discoverMockMcpEndpoints();
    const artifact = withFirstIntent(
      deterministicCognitiveStep({ user_prompt: "search", capability_snapshot: snapshot }),
      { preconditions: ["fail this precondition"] },
    );

    const result = await runReconciliation({ user_prompt: "search" }, snapshot, artifact);

    expect(result.status).toBe("failed");
    expect(result.errors[0]?.code).toBe("PRECONDITION_FAILED");
  });

  it("records MCP execution failure", async () => {
    const snapshot = await discoverMockMcpEndpoints();
    const artifact = deterministicCognitiveStep({
      user_prompt: "search",
      capability_snapshot: snapshot,
    });

    const result = await runReconciliation(
      { user_prompt: "search" },
      snapshot,
      artifact,
      {
        execute_mcp: async () => ({ status: "error", message: "mock failure" }),
      },
    );

    expect(result.status).toBe("failed");
    expect(result.errors[0]?.code).toBe("ENDPOINT_EXECUTION_FAILED");
  });

  it("records result validation failure", async () => {
    const snapshot = await discoverMockMcpEndpoints();
    const artifact = deterministicCognitiveStep({
      user_prompt: "search",
      capability_snapshot: snapshot,
    });

    const result = await runReconciliation(
      { user_prompt: "search" },
      snapshot,
      artifact,
      {
        execute_mcp: async () => ({ status: "ok", message: "bad result", result: { nope: true } }),
      },
    );

    expect(result.status).toBe("failed");
    expect(result.errors[0]?.code).toBe("RESULT_VALIDATION_FAILED");
  });

  it("yields when no execution intent is present", async () => {
    const snapshot = await discoverMockMcpEndpoints();
    const artifact = {
      ...deterministicCognitiveStep({ user_prompt: "search", capability_snapshot: snapshot }),
      execution_intents: [],
      yield_reason: "No compatible capability",
    };

    const result = await runReconciliation({ user_prompt: "search" }, snapshot, artifact);

    expect(result.status).toBe("yielded");
    expect(result.errors[0]?.code).toBe("YIELDED");
  });
});

function withFirstIntent(
  artifact: CognitiveArtifact,
  patch: Partial<CognitiveArtifact["execution_intents"][number]>,
): CognitiveArtifact {
  const [first, ...rest] = artifact.execution_intents;
  if (!first) throw new Error("missing fixture intent");
  return {
    ...artifact,
    execution_intents: [{ ...first, ...patch }, ...rest],
  };
}
