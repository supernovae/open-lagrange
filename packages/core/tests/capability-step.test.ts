import { describe, expect, it } from "vitest";
import { createPackRegistry, type CapabilityDefinition, type CapabilityPack, type PackExecutionContext } from "@open-lagrange/capability-sdk";
import { z } from "zod";
import { packRegistry } from "../src/capability-registry/registry.js";
import { researchWorkflowCapabilityRefs, researchWorkflowTemplates } from "../src/capability-packs/research/workflow-templates.js";
import { createInitialPlanState, type PlanState } from "../src/planning/plan-state.js";
import { runCapabilityStep } from "../src/runtime/capability-step-runner.js";
import type { CapabilityStepInput } from "../src/runtime/capability-step-schema.js";
import type { DelegationContext } from "../src/schemas/delegation.js";
import type { ScopedTask } from "../src/schemas/reconciliation.js";

const now = "2026-04-29T12:00:00.000Z";

describe("capability execution step wrapper", () => {
  it("rejects unknown capabilities", async () => {
    const result = await runCapabilityStep(stepInput({ capability_ref: "missing.capability", capability_digest: "0".repeat(64) }), { registry: packRegistry, now });

    expect(result.status).toBe("failed");
    expect(result.structured_errors[0]?.code).toBe("UNKNOWN_CAPABILITY");
  });

  it("rejects digest mismatches", async () => {
    const descriptor = descriptorFor("search_docs");
    const result = await runCapabilityStep(stepInput({ capability_ref: descriptor.name, capability_digest: "0".repeat(64), input: { query: "docs" } }), { registry: packRegistry, now });

    expect(result.status).toBe("failed");
    expect(result.structured_errors[0]?.code).toBe("CAPABILITY_DIGEST_MISMATCH");
  });

  it("rejects invalid input before execution", async () => {
    const descriptor = descriptorFor("search_docs");
    const result = await runCapabilityStep(stepInput({ capability_ref: descriptor.name, capability_digest: descriptor.capability_digest, input: {} }), { registry: packRegistry, now });

    expect(result.status).toBe("failed");
    expect(result.structured_errors[0]?.code).toBe("SCHEMA_VALIDATION_FAILED");
  });

  it("stops execution when policy denies the capability", async () => {
    const descriptor = descriptorFor("search_docs");
    const result = await runCapabilityStep(stepInput({
      capability_ref: descriptor.name,
      capability_digest: descriptor.capability_digest,
      input: { query: "docs" },
      delegation_context: delegation({ allowed_capabilities: [] }),
    }), {
      registry: packRegistry,
      now,
      scoped_task: scopedTask({ allowed_capabilities: [] }),
    });

    expect(result.status).toBe("failed");
    expect(result.policy_report?.decision).toBe("deny");
    expect(result.structured_errors[0]?.code).toBe("POLICY_DENIED");
  });

  it("returns requires_approval when a capability needs approval", async () => {
    const descriptor = descriptorFor("write_note");
    const result = await runCapabilityStep(stepInput({
      capability_ref: descriptor.name,
      capability_digest: descriptor.capability_digest,
      input: { path: "notes.md", content: "hello" },
      delegation_context: delegation({ max_risk_level: "write", allowed_capabilities: [descriptor.name], allowed_scopes: ["project:write"] }),
    }), { registry: packRegistry, now });

    expect(result.status).toBe("requires_approval");
    expect(result.policy_report?.decision).toBe("requires_approval");
    expect(result.structured_errors[0]?.code).toBe("APPROVAL_REQUIRED");
  });

  it("records artifact lineage for successful execution", async () => {
    const registry = createPackRegistry().registerPack(lineagePack());
    const descriptor = registry.listCapabilities({})[0];
    const recorded: unknown[] = [];
    let updatedPlanState: PlanState | undefined;
    const planState = createInitialPlanState({
      plan_id: "plan_1",
      status: "running",
      canonical_plan_digest: "1".repeat(64),
      nodes: [{ id: "node_1", status: "running" }],
      artifact_refs: [],
      now,
    });
    const result = await runCapabilityStep(stepInput({
      capability_ref: descriptor.capability_id,
      capability_digest: descriptor.capability_digest,
      input: { value: "ok" },
      input_artifact_refs: ["input_artifact"],
      delegation_context: delegation({ allowed_capabilities: [descriptor.capability_id], allowed_scopes: ["test:read"] }),
    }), {
      registry,
      now,
      record_artifact: async (artifact) => { recorded.push(artifact); },
      plan_state: planState,
      plan_state_store: {
        recordPlanState: async (state) => {
          updatedPlanState = state;
          return state;
        },
        getPlanState: async () => updatedPlanState,
      },
    });

    expect(result.status).toBe("success");
    expect(result.started_at).toBeTruthy();
    expect(result.completed_at).toBeTruthy();
    expect(result.output_artifact_refs).toContain("capability_step_artifact");
    expect(updatedPlanState?.node_states[0]?.status).toBe("completed");
    expect(updatedPlanState?.node_states[0]?.artifacts[0]?.kind).toBe("capability_step_result");
    expect(recorded).toMatchObject([{
      lineage: {
        produced_by_pack_id: "open-lagrange.step-test",
        produced_by_capability_id: "open-lagrange.step-test.echo",
        produced_by_plan_id: "plan_1",
        produced_by_node_id: "node_1",
        input_artifact_refs: ["input_artifact"],
      },
    }]);
  });

  it("records output validation failures", async () => {
    const registry = createPackRegistry().registerPack(invalidOutputPack());
    const descriptor = registry.listCapabilities({})[0];
    const result = await runCapabilityStep(stepInput({
      capability_ref: descriptor.capability_id,
      capability_digest: descriptor.capability_digest,
      input: { value: "ok" },
      delegation_context: delegation({ allowed_capabilities: [descriptor.capability_id], allowed_scopes: ["test:read"] }),
    }), { registry, now });

    expect(result.status).toBe("failed");
    expect(result.structured_errors[0]?.code).toBe("RESULT_VALIDATION_FAILED");
  });

  it("executes research.fetch_source through the wrapper in fixture mode", async () => {
    const descriptor = descriptorFor("research.fetch_source");
    const artifacts: unknown[] = [];
    const result = await runCapabilityStep(stepInput({
      capability_ref: descriptor.name,
      capability_digest: descriptor.capability_digest,
      input: {
        url: "https://example.invalid/open-lagrange/planning-primitive",
        source_id: "planning-primitive",
        mode: "fixture",
        max_bytes: 500_000,
        timeout_ms: 8_000,
        accepted_content_types: ["text/markdown"],
      },
      delegation_context: delegation({ allowed_capabilities: [descriptor.name], allowed_scopes: descriptor.scopes }),
    }), {
      registry: packRegistry,
      now,
      record_artifact: async (artifact) => { artifacts.push(artifact); },
    });

    expect(result.status).toBe("success");
    expect(result.output).toMatchObject({ source_id: "planning-primitive", content_type: "text/markdown" });
    expect(result.output_artifact_refs.some((artifactId) => artifactId.startsWith("source_text_"))).toBe(true);
    expect(artifacts.length).toBeGreaterThan(0);
  });

  it("marks research templates as capability step templates", () => {
    expect(researchWorkflowTemplates.find((template) => template.template_id === "research_brief_from_topic")?.runtime_step_kind).toBe("capability_step");
    expect(researchWorkflowCapabilityRefs("research_brief_from_topic")).toEqual([
      "research.search",
      "research.fetch_source",
      "research.extract_content",
      "research.create_source_set",
      "research.create_brief",
      "research.export_markdown",
    ]);
  });
});

function descriptorFor(name: string) {
  const descriptor = packRegistry.listCapabilities({}).find((capability) => capability.name === name || capability.capability_id === name);
  if (!descriptor) throw new Error(`Missing test capability ${name}`);
  return descriptor;
}

function stepInput(overrides: Partial<CapabilityStepInput> = {}): CapabilityStepInput {
  return {
    plan_id: "plan_1",
    node_id: "node_1",
    capability_ref: "search_docs",
    capability_digest: descriptorFor("search_docs").capability_digest,
    input: { query: "docs" },
    delegation_context: delegation(),
    idempotency_key: "step_key_1",
    input_artifact_refs: [],
    ...overrides,
  };
}

function delegation(overrides: Partial<DelegationContext> = {}): DelegationContext {
  return {
    principal_id: "human_1",
    principal_type: "human",
    delegate_id: "runtime_1",
    delegate_type: "runtime",
    project_id: "project_1",
    workspace_id: "workspace_1",
    allowed_scopes: ["project:read"],
    denied_scopes: [],
    allowed_capabilities: ["search_docs"],
    max_risk_level: "read",
    approval_required_for: [],
    expires_at: "2026-04-29T13:00:00.000Z",
    trace_id: "trace_1",
    parent_run_id: "run_1",
    ...overrides,
  };
}

function scopedTask(overrides: Partial<ScopedTask> = {}): ScopedTask {
  return {
    task_id: "node_1",
    title: "Test capability step",
    objective: "Run test capability through wrapper.",
    allowed_scopes: ["project:read"],
    allowed_capabilities: ["search_docs"],
    max_risk_level: "read",
    ...overrides,
  };
}

function lineagePack(): CapabilityPack {
  return testPack("open-lagrange.step-test", [{
    descriptor: {
      capability_id: "open-lagrange.step-test.echo",
      pack_id: "open-lagrange.step-test",
      name: "echo",
      description: "Echo test input and record a test artifact.",
      input_schema: { type: "object" },
      output_schema: { type: "object" },
      risk_level: "read",
      side_effect_kind: "none",
      requires_approval: false,
      idempotency_mode: "recommended",
      timeout_ms: 1_000,
      max_attempts: 1,
      scopes: ["test:read"],
      tags: ["test"],
      examples: [],
    },
    input_schema: z.object({ value: z.string() }).strict(),
    output_schema: z.object({ value: z.string() }).strict(),
    execute: async (context: PackExecutionContext, input: { readonly value: string }) => {
      await context.recordArtifact({ artifact_id: "capability_step_artifact", kind: "test" });
      return input;
    },
  }]);
}

function invalidOutputPack(): CapabilityPack {
  return testPack("open-lagrange.step-invalid-output", [{
    descriptor: {
      capability_id: "open-lagrange.step-invalid-output.bad",
      pack_id: "open-lagrange.step-invalid-output",
      name: "bad",
      description: "Return an invalid output for wrapper tests.",
      input_schema: { type: "object" },
      output_schema: { type: "object" },
      risk_level: "read",
      side_effect_kind: "none",
      requires_approval: false,
      idempotency_mode: "recommended",
      timeout_ms: 1_000,
      max_attempts: 1,
      scopes: ["test:read"],
      tags: ["test"],
      examples: [],
    },
    input_schema: z.object({ value: z.string() }).strict(),
    output_schema: z.object({ value: z.string() }).strict(),
    execute: () => ({ wrong: true }),
  }]);
}

function testPack(packId: string, capabilities: readonly CapabilityDefinition[]): CapabilityPack {
  return {
    manifest: {
      pack_id: packId,
      name: "Capability Step Test Pack",
      version: "0.1.0",
      description: "Local test pack for capability step wrapper coverage.",
      publisher: "open-lagrange",
      license: "MIT",
      runtime_kind: "mock",
      trust_level: "trusted_core",
      required_scopes: ["test:read"],
      provided_scopes: ["test:read"],
      default_policy: {},
      open_cot_alignment: {},
    },
    capabilities,
  };
}
