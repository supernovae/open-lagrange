import { describe, expect, it } from "vitest";
import { createPackRegistry, type CapabilityPack } from "@open-lagrange/capability-sdk";
import { z } from "zod";
import { createArtifactSummary, registerArtifacts } from "../src/artifacts/artifact-viewer.js";
import { createCapabilitySnapshotForTask } from "../src/capability-registry/registry.js";
import { createMockDelegationContext } from "../src/clients/mock-delegation.js";
import { createInitialPlanState, type PlanState, type PlanStateStore } from "../src/planning/plan-state.js";
import { PlanRunner } from "../src/planning/plan-runner.js";
import { Planfile, type Planfile as PlanfileType } from "../src/planning/planfile-schema.js";
import { withCanonicalPlanDigest } from "../src/planning/planfile-validator.js";
import { runCapabilityStep } from "../src/runtime/capability-step-runner.js";
import { buildRunSnapshot } from "../src/runs/run-snapshot-builder.js";
import { createRunEvent, type RunEvent } from "../src/runs/run-event.js";
import { inMemoryRunControlStore } from "../src/runs/run-control.js";

const now = "2026-05-03T12:00:00.000Z";

describe("run console event model", () => {
  it("emits run and node events from PlanRunner in execution order", async () => {
    const events: RunEvent[] = [];
    const store = memoryPlanStore();
    const plan = withCanonicalPlanDigest(planfile());
    const runner = new PlanRunner({
      store,
      capability_snapshot: createCapabilitySnapshotForTask({ allowed_capabilities: [], allowed_scopes: [], max_risk_level: "read", now }),
      handlers: {
        frame: async () => ({ status: "completed" }),
        inspect: async () => ({ status: "completed" }),
      },
      run_id: "run_plan_events",
      emit_run_event: async (event) => { events.push(event); },
      now: () => now,
    });

    await runner.runToCompletion(plan);

    expect(events.map((event) => event.type)).toEqual([
      "run.created",
      "run.started",
      "node.started",
      "node.completed",
      "node.started",
      "node.completed",
      "run.completed",
    ]);
  });

  it("auto-completes structural frame nodes before capability or handler nodes", async () => {
    const events: RunEvent[] = [];
    const store = memoryPlanStore();
    const plan = withCanonicalPlanDigest(planfile());
    const runner = new PlanRunner({
      store,
      capability_snapshot: createCapabilitySnapshotForTask({ allowed_capabilities: [], allowed_scopes: [], max_risk_level: "read", now }),
      handlers: {
        inspect: async () => ({ status: "completed" }),
      },
      run_id: "run_structural_frame",
      emit_run_event: async (event) => { events.push(event); },
      now: () => now,
    });

    const result = await runner.runToCompletion(plan);

    expect(result.state.status).toBe("completed");
    expect(events.map((event) => `${event.type}:${event.node_id ?? "run"}`)).toEqual([
      "run.created:run",
      "run.started:run",
      "node.started:frame_goal",
      "node.completed:frame_goal",
      "node.started:inspect_output",
      "node.completed:inspect_output",
      "run.completed:run",
    ]);
  });

  it("emits capability, policy, and artifact events from CapabilityStepRunner", async () => {
    const registry = createPackRegistry().registerPack(testPack());
    const descriptor = registry.listCapabilities({})[0];
    const events: RunEvent[] = [];

    const result = await runCapabilityStep({
      plan_id: "plan_capability_events",
      node_id: "node_fetch",
      capability_ref: descriptor.capability_id,
      capability_digest: descriptor.capability_digest,
      input: { value: "ok" },
      delegation_context: createMockDelegationContext({
        goal: "test",
        project_id: "plan_capability_events",
        allowed_scopes: ["test:read"],
        allowed_capabilities: [descriptor.capability_id],
      }),
      idempotency_key: "step_key",
      input_artifact_refs: [],
    }, {
      registry,
      now,
      run_id: "run_capability_events",
      emit_run_event: async (event) => { events.push(event); },
      record_artifact: async () => undefined,
    });

    expect(result.status).toBe("success");
    expect(events.map((event) => event.type)).toContain("capability.started");
    expect(events.map((event) => event.type)).toContain("policy.evaluated");
    expect(events.map((event) => event.type)).toContain("artifact.created");
    expect(events.map((event) => event.type)).toContain("capability.completed");
  });

  it("builds active node, artifacts, approvals, model calls, and next actions into a snapshot", async () => {
    const store = memoryPlanStore();
    const state = createInitialPlanState({
      plan_id: "plan_snapshot",
      status: "yielded",
      canonical_plan_digest: "1".repeat(64),
      nodes: [{ id: "node_a", status: "running" }],
      artifact_refs: [{ artifact_id: "artifact_a", kind: "capability_step_result", path_or_uri: "artifact://artifact_a", summary: "Output", created_at: now }],
      now,
    });
    await store.recordPlanState(state);
    registerArtifacts({
      artifacts: [createArtifactSummary({
        artifact_id: "artifact_a",
        kind: "capability_step_result",
        title: "Output",
        summary: "Output",
        path_or_uri: "artifact://artifact_a",
        related_plan_id: "plan_snapshot",
        created_at: now,
      })],
      now,
    });
    const events = [
      event("run.created", "run_snapshot", "plan_snapshot", { plan_title: "Snapshot plan" }),
      event("run.started", "run_snapshot", "plan_snapshot"),
      event("node.started", "run_snapshot", "plan_snapshot", { title: "Node A", kind: "inspect" }, "node_a"),
      event("approval.requested", "run_snapshot", "plan_snapshot", { reason: "Needs approval" }, "node_a", { approval_id: "approval_a" }),
      event("artifact.created", "run_snapshot", "plan_snapshot", { artifact_id: "artifact_a" }, "node_a", { artifact_id: "artifact_a" }),
      event("model_call.completed", "run_snapshot", "plan_snapshot", { title: "Planner call" }, "node_a", { model_call_artifact_id: "model_call_a" }),
      event("node.yielded", "run_snapshot", "plan_snapshot", { message: "Waiting" }, "node_a"),
      event("run.yielded", "run_snapshot", "plan_snapshot"),
    ];

    const snapshot = await buildRunSnapshot({ run_id: "run_snapshot", events, store });

    expect(snapshot?.active_node_id).toBe("node_a");
    expect(snapshot?.approvals[0]?.approval_id).toBe("approval_a");
    expect(snapshot?.model_calls[0]?.model_call_artifact_id).toBe("model_call_a");
    expect(snapshot?.next_actions.map((action) => action.action_type)).toEqual(expect.arrayContaining(["approve", "reject", "resume", "inspect_artifact"]));
  });

  it("includes the originating Plan Builder session in run snapshots", async () => {
    const store = memoryPlanStore();
    const plan = withCanonicalPlanDigest(Planfile.parse({
      ...planfile(),
      lifecycle: { builder_session_id: "builder_edit_source" },
    }));
    await store.recordPlanState(createInitialPlanState({
      plan_id: plan.plan_id,
      status: "yielded",
      canonical_plan_digest: plan.canonical_plan_digest ?? "1".repeat(64),
      nodes: plan.nodes.map((item) => ({ id: item.id, status: item.id === "frame_goal" ? "completed" : "yielded" })),
      artifact_refs: [],
      now,
    }));

    const snapshot = await buildRunSnapshot({
      run_id: "run_builder_source",
      events: [
        event("run.created", "run_builder_source", plan.plan_id, { plan_title: "Builder source plan" }),
        event("node.yielded", "run_builder_source", plan.plan_id, { title: "Inspect", kind: "inspect" }, "inspect_output"),
        event("run.yielded", "run_builder_source", plan.plan_id),
      ],
      planfile: plan,
      store,
    });

    expect(snapshot?.builder_session_id).toBe("builder_edit_source");
  });

  it("persists node attempts and UI state for durable run controls", async () => {
    const attempt = await inMemoryRunControlStore.recordNodeAttempt({
      attempt_id: "attempt_1",
      run_id: "run_control",
      node_id: "node_a",
      replay_mode: "reuse-artifacts",
      idempotency_key: "run_control:node_a:reuse-artifacts",
      input_artifact_refs: ["input_a"],
      output_artifact_refs: [],
      status: "queued",
      created_at: now,
      updated_at: now,
    });
    const uiState = await inMemoryRunControlStore.recordRunUiState({
      run_id: "run_control",
      session_key: "session_a",
      active_tab: "artifacts",
      selected_node_id: "node_a",
      updated_at: now,
    });

    expect(attempt.replay_mode).toBe("reuse-artifacts");
    expect(await inMemoryRunControlStore.listNodeAttempts("run_control", "node_a")).toHaveLength(1);
    expect((await inMemoryRunControlStore.getRunUiState("run_control", "session_a"))?.active_tab).toBe(uiState.active_tab);
  });
});

function memoryPlanStore(): PlanStateStore {
  let state: PlanState | undefined;
  return {
    recordPlanState: async (next) => {
      state = next;
      return next;
    },
    getPlanState: async () => state,
  };
}

function event(type: RunEvent["type"], runId: string, planId: string, payload: Record<string, unknown> = {}, nodeId?: string, ids: { readonly artifact_id?: string; readonly approval_id?: string; readonly model_call_artifact_id?: string } = {}): RunEvent {
  return createRunEvent({
    run_id: runId,
    plan_id: planId,
    type,
    timestamp: now,
    payload,
    ...(nodeId ? { node_id: nodeId } : {}),
    ...(ids.artifact_id ? { artifact_id: ids.artifact_id } : {}),
    ...(ids.approval_id ? { approval_id: ids.approval_id } : {}),
    ...(ids.model_call_artifact_id ? { model_call_artifact_id: ids.model_call_artifact_id } : {}),
  });
}

function planfile(): PlanfileType {
  return Planfile.parse({
    schema_version: "open-lagrange.plan.v1",
    plan_id: "plan_events",
    goal_frame: {
      goal_id: "goal_events",
      original_prompt: "Run event test",
      interpreted_goal: "Run event test",
      acceptance_criteria: ["Events are emitted."],
      non_goals: [],
      assumptions: [],
      ambiguity: { level: "low", questions: [], blocking: false },
      suggested_mode: "dry_run",
      risk_notes: [],
      created_at: now,
    },
    mode: "dry_run",
    status: "draft",
    nodes: [
      node("frame_goal", "frame", []),
      node("inspect_output", "inspect", ["frame_goal"]),
    ],
    edges: [{ from: "frame_goal", to: "inspect_output", reason: "then inspect" }],
    approval_policy: { require_approval_for_risks: ["write", "destructive", "external_side_effect"] },
    verification_policy: { allowed_command_ids: [] },
    artifact_refs: [],
    created_at: now,
    updated_at: now,
  });
}

function node(id: string, kind: PlanfileType["nodes"][number]["kind"], depends_on: readonly string[]): PlanfileType["nodes"][number] {
  return {
    id,
    kind,
    title: id,
    objective: id,
    description: id,
    depends_on: [...depends_on],
    allowed_capability_refs: [],
    expected_outputs: [],
    acceptance_refs: [],
    risk_level: "read",
    approval_required: false,
    status: "pending",
    artifacts: [],
    errors: [],
  };
}

function testPack(): CapabilityPack {
  return {
    manifest: {
      pack_id: "open-lagrange.run-console-test",
      name: "Run Console Test Pack",
      version: "0.0.1",
      description: "Local test pack for run event coverage.",
      publisher: "open-lagrange",
      license: "MIT",
      runtime_kind: "mock",
      trust_level: "trusted_core",
      required_scopes: ["test:read"],
      provided_scopes: ["test:read"],
      default_policy: {},
      open_cot_alignment: {},
    },
    capabilities: [{
      descriptor: {
        capability_id: "open-lagrange.run-console-test.echo",
        pack_id: "open-lagrange.run-console-test",
        name: "echo",
        description: "Echo input and record an artifact.",
        input_schema: { type: "object" },
        output_schema: { type: "object" },
        risk_level: "read",
        side_effect_kind: "none",
        requires_approval: false,
        idempotency_mode: "required",
        timeout_ms: 1000,
        max_attempts: 1,
        scopes: ["test:read"],
        tags: [],
        examples: [],
      },
      input_schema: z.object({ value: z.string() }).strict(),
      output_schema: z.object({ value: z.string() }).strict(),
      execute: async (context, input) => {
        await context.recordArtifact({ artifact_id: "capability_artifact", kind: "capability_step_result" });
        return input;
      },
    }],
  };
}
