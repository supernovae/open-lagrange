import { existsSync, mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { executeModelRoleCall, ModelCallArtifact, listModelCallArtifactsForPlan, persistModelCallArtifacts, redactModelCallValue } from "../src/models/index.js";

vi.mock("ai", () => ({
  generateObject: vi.fn(async () => ({
    object: { ok: true },
    usage: { inputTokens: 7, outputTokens: 3, totalTokens: 10 },
    requestId: "request_test",
  })),
}));

describe("model-call telemetry artifacts", () => {
  it("validates the model-call artifact schema", () => {
    expect(ModelCallArtifact.parse({
      artifact_id: "model_call_test",
      artifact_kind: "model_call",
      call_id: "call_test",
      role: "planner",
      provider: "local",
      model: "local-model",
      status: "success",
      input_artifact_refs: [],
      output_artifact_refs: [],
      schema_validation_status: "passed",
      token_usage: { total_tokens: 10, estimated: true },
      cost: { estimated: true },
      started_at: "2026-04-30T12:00:00.000Z",
      redaction_status: "redacted",
    }).artifact_kind).toBe("model_call");
  });

  it("redacts credential-looking values", () => {
    const redacted = redactModelCallValue({
      header: "Authorization: Bearer sk-testsecret123456",
      nested: { api_key: "sk-testsecret123456", path: "/Users/example/project" },
    });

    expect(JSON.stringify(redacted.value)).not.toContain("sk-testsecret123456");
    expect(JSON.stringify(redacted.value)).not.toContain("/Users/example");
    expect(redacted.redaction_status).toBe("redacted");
  });

  it("writes model-call artifacts directly", () => {
    const root = mkdtempSync(join(tmpdir(), "open-lagrange-model-call-"));
    const result = persistModelCallArtifacts({
      artifact_dir: join(root, "artifacts"),
      artifact_index_path: join(root, "index.json"),
      call_id: "call_direct",
      role: "planner",
      provider: "local",
      model: "local-model",
      status: "success",
      started_at: "2026-04-30T12:00:00.000Z",
      completed_at: "2026-04-30T12:00:01.000Z",
      prompt: { token: "secret-token-value" },
      response: { ok: true },
      plan_id: "plan_direct",
      schema_validation_status: "passed",
    });

    expect(result.model_call_artifact_id).toMatch(/^model_call_/);
    expect(listModelCallArtifactsForPlan("plan_direct", join(root, "index.json"))[0]?.status).toBe("success");
  });

  it("executor writes model-call artifacts on success", async () => {
    const root = mkdtempSync(join(tmpdir(), "open-lagrange-model-call-"));
    const result = await executeModelRoleCall({
      role: "planner",
      model_ref: { provider: "local", model: "local-model", role_label: "planner" },
      schema: z.object({ ok: z.boolean() }).strict(),
      system: "Emit JSON.",
      prompt: JSON.stringify({ goal: "test" }),
      persist_telemetry: true,
      trace_context: {
        plan_id: "plan_success",
        artifact_dir: join(root, "artifacts"),
        artifact_index_path: join(root, "index.json"),
        output_schema_name: "TestOutput",
      },
    });

    expect(result.telemetry_artifact_id).toBeTruthy();
    const calls = listModelCallArtifactsForPlan("plan_success", join(root, "index.json"));
    expect(calls).toHaveLength(1);
    expect(calls[0]?.token_usage.total_tokens).toBe(10);
  });

  it("executor writes provider-unavailable artifacts when a plan context exists", async () => {
    const root = mkdtempSync(join(tmpdir(), "open-lagrange-model-call-"));
    await expect(executeModelRoleCall({
      role: "planner",
      model_ref: { provider: "anthropic", model: "claude", role_label: "planner" },
      schema: z.object({ ok: z.boolean() }).strict(),
      system: "Emit JSON.",
      prompt: JSON.stringify({ goal: "test" }),
      persist_telemetry: true,
      trace_context: {
        plan_id: "plan_missing",
        artifact_dir: join(root, "artifacts"),
        artifact_index_path: join(root, "index.json"),
        output_schema_name: "TestOutput",
      },
    })).rejects.toThrow(/provider unavailable/i);

    const calls = listModelCallArtifactsForPlan("plan_missing", join(root, "index.json"));
    expect(calls[0]?.status).toBe("provider_unavailable");
    const content = readFileSync(join(root, "artifacts", `${calls[0]?.redacted_prompt_artifact_id}.json`), "utf8");
    expect(content).toContain("goal");
    expect(existsSync(join(root, "index.json"))).toBe(true);
  });
});

